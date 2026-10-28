import { createHash, randomBytes } from "node:crypto";
import { del, list, put } from "@vercel/blob";

/**
 * Persistent rate limits for the relayer, backed by the SAME Vercel Blob store as chest metadata
 * (LOOT_READ_WRITE_TOKEN). Blob has no atomic counter, so each hit is a MARKER object under a time-bucketed
 * prefix: write the marker, count markers under the prefix (capped at limit + 1), and delete our own marker
 * when over the limit. Concurrent hits can only over-deny (both see limit + 1 and both back off), never
 * over-allow. Cost per checked request: one put + one list (+ one delete when denied).
 *
 * Fail behavior (see docs/FIREWALL.md): on BOTH networks a store error or a missing token DENIES the request
 * ("unavailable", HTTP 503 rate_limit_unavailable). Testnet used to fail open; a faucet-funded relayer is still
 * a shared resource, so without the shared counters nothing is sponsored.
 *
 * Old buckets are never read again; they are small private JSON markers. Purge `relay/<net>/rl/` older than
 * 2 days from the Blob dashboard or a cron if the count ever matters.
 */
export interface MarkerStore {
  /** Writes a marker under `key` and returns a handle usable with `remove`. */
  add(key: string): Promise<string>;
  /** Number of markers under `prefix`, counting at most `upTo`. */
  count(prefix: string, upTo: number): Promise<number>;
  remove(handle: string): Promise<void>;
}

const MAX_COUNT = 999; // one Blob list page

export type HitResult = { ok: true; release: () => Promise<void> } | { ok: false };

/** Records one hit under `prefix`; ok:false (and the marker removed) when the bucket already holds `limit`. */
export async function recordHit(store: MarkerStore, prefix: string, limit: number): Promise<HitResult> {
  const max = Math.min(Math.max(1, Math.floor(limit)), MAX_COUNT);
  const handle = await store.add(`${prefix}${Date.now()}-${randomBytes(6).toString("hex")}.json`);
  const release = async () => {
    await store.remove(handle).catch(() => undefined);
  };
  const n = await store.count(prefix, max + 1);
  if (n > max) {
    await release();
    return { ok: false };
  }
  return { ok: true, release };
}

// ---------- Blob-backed store ----------
const token = () => process.env.LOOT_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const auth = () => (token() ? { token: token()! } : {});

export const blobMarkerStore: MarkerStore = {
  async add(key) {
    const r = await put(key, JSON.stringify({ at: new Date().toISOString() }), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      ...auth(),
    });
    return r.url;
  },
  async count(prefix, upTo) {
    const page = await list({ prefix, limit: upTo, ...auth() });
    return page.blobs.length;
  },
  async remove(handle) {
    await del(handle, auth());
  },
};

// ---------- Policy ----------
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export type RelayScope = "claim" | "passkey-send";

export type PersistentLimits = {
  /** Global requests per minute for the scope. */
  globalPerMin: number;
  /** Passkey wallet deploys per IP per day. */
  deployPerIpPerDay: number;
  /** Passkey wallet deploys per day, all IPs. */
  deployGlobalPerDay: number;
};

export function persistentLimits(mainnet: boolean, scope: RelayScope): PersistentLimits {
  const g = scope === "claim" ? "CLAIM" : "PASSKEY";
  return mainnet
    ? {
        globalPerMin: num(process.env[`RELAY_PERSIST_${g}_GLOBAL_PER_MIN_MAINNET`], 120),
        deployPerIpPerDay: num(process.env.RELAY_DEPLOY_PER_IP_PER_DAY_MAINNET, 3),
        deployGlobalPerDay: num(process.env.RELAY_DEPLOY_GLOBAL_PER_DAY_MAINNET, 60),
      }
    : {
        globalPerMin: num(process.env[`RELAY_PERSIST_${g}_GLOBAL_PER_MIN`], 600),
        deployPerIpPerDay: num(process.env.RELAY_DEPLOY_PER_IP_PER_DAY, 3),
        deployGlobalPerDay: num(process.env.RELAY_DEPLOY_GLOBAL_PER_DAY, 50),
      };
}

/** IPs are stored only as a truncated salted hash. */
export function ipKey(ip: string): string {
  return createHash("sha256").update(`loot-rl:${ip}`).digest("hex").slice(0, 16);
}

export type GateResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: "global" | "deploy_ip" | "deploy_global" | "unavailable" };

/**
 * Persistent gate for one relayed request. `deploy` adds the per-IP and global daily wallet-deploy counters.
 * `release()` returns every slot taken (call it when the request fails before anything was sent).
 */
export async function persistentGate(i: {
  store: MarkerStore;
  net: string;
  mainnet: boolean;
  scope: RelayScope;
  ip: string;
  deploy?: boolean;
  now?: number;
}): Promise<GateResult> {
  const now = i.now ?? Date.now();
  const lim = persistentLimits(i.mainnet, i.scope);
  const base = `relay/${i.net}/rl/`;
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const taken: Array<() => Promise<void>> = [];
  const releaseAll = async () => {
    await Promise.all(taken.map((r) => r()));
  };
  const step = async (prefix: string, limit: number, reason: "global" | "deploy_ip" | "deploy_global"): Promise<GateResult | null> => {
    const r = await recordHit(i.store, prefix, limit);
    if (!r.ok) {
      await releaseAll();
      return { ok: false, reason };
    }
    taken.push(r.release);
    return null;
  };
  try {
    const steps: Array<[string, number, "global" | "deploy_ip" | "deploy_global"]> = [[`${base}${i.scope}/g/${minute}/`, lim.globalPerMin, "global"]];
    if (i.deploy) {
      steps.push([`${base}deploy/ip/${ipKey(i.ip)}/${day}/`, lim.deployPerIpPerDay, "deploy_ip"]);
      steps.push([`${base}deploy/g/${day}/`, lim.deployGlobalPerDay, "deploy_global"]);
    }
    for (const [prefix, limit, reason] of steps) {
      const denied = await step(prefix, limit, reason);
      if (denied) return denied;
    }
    return { ok: true, release: releaseAll };
  } catch (e) {
    await releaseAll();
    console.error(`rate-limit store error (${i.net}/${i.scope})`, (e as Error)?.name);
    // Fails closed on both networks: no store, no sponsored tx.
    return { ok: false, reason: "unavailable" };
  }
}

/** Safe HTTP shape for a denied gate (no internals). */
export function gateDenial(reason: Extract<GateResult, { ok: false }>["reason"]): {
  status: number;
  body: { error: string; code: string };
  retryAfter?: string;
} {
  switch (reason) {
    case "unavailable":
      return { status: 503, body: { error: "Sponsored transactions are temporarily unavailable. Try again later.", code: "rate_limit_unavailable" } };
    case "deploy_ip":
    case "deploy_global":
      return {
        status: 429,
        body: { error: "The daily limit of sponsored account setups was reached. Try again tomorrow or connect a Stellar wallet.", code: "deploy_limit" },
        retryAfter: "3600",
      };
    default:
      return { status: 429, body: { error: "Too many requests. Try again in a minute.", code: "rate_limited" }, retryAfter: "60" };
  }
}
