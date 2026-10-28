import { afterEach, describe, expect, it } from "vitest";
import { gateDenial, persistentGate, persistentLimits, recordHit, ipKey, type MarkerStore } from "./persistent-limit";

function memStore(opts: { failAfter?: number } = {}): MarkerStore & { keys: Set<string> } {
  const keys = new Set<string>();
  let ops = 0;
  const guard = () => {
    if (opts.failAfter !== undefined && ops++ >= opts.failAfter) throw new Error("store down");
  };
  return {
    keys,
    async add(k) {
      guard();
      keys.add(k);
      return k;
    },
    async count(prefix, upTo) {
      guard();
      return Math.min([...keys].filter((k) => k.startsWith(prefix)).length, upTo);
    },
    async remove(h) {
      keys.delete(h);
    },
  };
}

const base = { net: "mainnet", mainnet: true, scope: "claim" as const, ip: "1.2.3.4", now: 1_700_000_000_000 };
afterEach(() => {
  delete process.env.RELAY_PERSIST_CLAIM_GLOBAL_PER_MIN_MAINNET;
  delete process.env.RELAY_DEPLOY_PER_IP_PER_DAY_MAINNET;
});

describe("recordHit", () => {
  it("allows up to the limit and denies the next, leaving no stray marker", async () => {
    const s = memStore();
    for (let i = 0; i < 3; i++) expect((await recordHit(s, "p/", 3)).ok).toBe(true);
    expect((await recordHit(s, "p/", 3)).ok).toBe(false);
    expect(s.keys.size).toBe(3);
  });
  it("release gives the slot back", async () => {
    const s = memStore();
    const r = await recordHit(s, "p/", 1);
    expect(r.ok && (await r.release())).toBeUndefined();
    expect((await recordHit(s, "p/", 1)).ok).toBe(true);
  });
});

describe("persistentGate", () => {
  it("enforces the global per-minute limit across 'instances' sharing the store", async () => {
    process.env.RELAY_PERSIST_CLAIM_GLOBAL_PER_MIN_MAINNET = "2";
    const s = memStore();
    expect((await persistentGate({ ...base, store: s })).ok).toBe(true);
    expect((await persistentGate({ ...base, store: s, ip: "9.9.9.9" })).ok).toBe(true);
    const r = await persistentGate({ ...base, store: s, ip: "8.8.8.8" });
    expect(r).toEqual({ ok: false, reason: "global" });
  });
  it("a new minute is a new bucket", async () => {
    process.env.RELAY_PERSIST_CLAIM_GLOBAL_PER_MIN_MAINNET = "1";
    const s = memStore();
    expect((await persistentGate({ ...base, store: s })).ok).toBe(true);
    expect((await persistentGate({ ...base, store: s })).ok).toBe(false);
    expect((await persistentGate({ ...base, store: s, now: base.now + 61_000 })).ok).toBe(true);
  });
  it("limits wallet deploys per IP per day and frees the global slot when denied", async () => {
    process.env.RELAY_DEPLOY_PER_IP_PER_DAY_MAINNET = "1";
    const s = memStore();
    const d = { ...base, store: s, scope: "passkey-send" as const, deploy: true };
    expect((await persistentGate(d)).ok).toBe(true);
    expect(await persistentGate(d)).toEqual({ ok: false, reason: "deploy_ip" });
    // a different IP still passes; the denied attempt left no markers behind
    expect((await persistentGate({ ...d, ip: "5.5.5.5" })).ok).toBe(true);
    expect([...s.keys].filter((k) => k.includes("/deploy/g/")).length).toBe(2);
  });
  it("does not store raw IPs", async () => {
    const s = memStore();
    await persistentGate({ ...base, store: s, scope: "passkey-send", deploy: true });
    expect([...s.keys].join(" ")).not.toContain("1.2.3.4");
    expect(ipKey("1.2.3.4")).toHaveLength(16);
  });
  it("mainnet fails closed when the store errors", async () => {
    expect(await persistentGate({ ...base, store: memStore({ failAfter: 0 }) })).toEqual({ ok: false, reason: "unavailable" });
  });
  it("testnet fails open when the store errors", async () => {
    const r = await persistentGate({ ...base, net: "testnet", mainnet: false, store: memStore({ failAfter: 0 }) });
    expect(r.ok).toBe(true);
  });
  it("maps denial reasons to safe statuses", () => {
    expect(gateDenial("unavailable").status).toBe(503);
    expect(gateDenial("deploy_ip").body.code).toBe("deploy_limit");
    expect(gateDenial("global")).toMatchObject({ status: 429, retryAfter: "60" });
  });
  it("mainnet defaults are stricter than testnet", () => {
    expect(persistentLimits(true, "claim").deployPerIpPerDay).toBeLessThan(persistentLimits(false, "claim").deployPerIpPerDay);
  });
});
