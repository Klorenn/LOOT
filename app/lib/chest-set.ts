import { stroopsToXlm, xlmToStroops } from "./config";

/**
 * Chest SETS (app-level only, no contract or circuit changes).
 *
 * A set is N ordinary registry chests, each with its own question, its own answer fingerprint
 * (independent random salt) and `max_claims = 1`. Knowing answer 1 gives no information about
 * answer 2: the fingerprints share nothing. The app groups the chests under one link.
 *
 * IMPORTANT: "one Loot per account per set" is enforced OFF-CHAIN only (our /api/claim relayer).
 * It is NOT a guarantee. Anyone can create several accounts (sybil) or call the contract directly
 * without the relayer. On-chain enforcement is a separate contract change.
 *
 * Pure helpers only (no I/O) so the rules are unit-tested.
 */

export const SET_LIMITS = {
  min: 2,
  max: 10,
  /** Passkey on mainnet goes through our sponsored relayer: 10 requests/min/IP and a fee reserve per tx. */
  maxPasskeyMainnet: 5,
  title: 80,
} as const;

/** Stored in each member chest's metadata. `id` is the chest id of question 1 (index 0). */
export type SetRef = { id: number; index: number; size: number; title: string };

/** Write-once header, created when question 1 is confirmed. */
export type SetHeader = {
  id: number;
  title: string;
  creator: string;
  /** planned number of questions; members that were never created are simply absent */
  size: number;
  listed: boolean;
  createdAt: string;
};

export type SessionKind = "passkey" | "classic" | "wallet";

/**
 * Max questions for this creator. Freighter/other wallets sign N transactions themselves (no relayer
 * cost). Passkey creation is relayed: on mainnet the per-IP rate limit (10/min) and the relayer's
 * fee reserve make a long burst fail halfway, so it is capped lower. Testnet has no such limit.
 */
export function maxSetSize(kind: SessionKind, mainnet: boolean): number {
  return kind === "passkey" && mainnet ? SET_LIMITS.maxPasskeyMainnet : SET_LIMITS.max;
}

type Caps = { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number };

/**
 * Same caps as a single chest, applied to the whole set: every prize must pass the per-place cap and
 * the SUM of all prizes must pass the total cap. (The relayer only sees one tx at a time, so the
 * across-the-set total is checked by the app and by /api/chests/meta.)
 */
export function setCapError(prizesStroops: readonly bigint[], caps: Caps): string | null {
  if (Number.isFinite(caps.maxPrizePerPlaceXlm)) {
    const max = xlmToStroops(caps.maxPrizePerPlaceXlm);
    if (prizesStroops.some((p) => p > max)) return `Limit: at most ${caps.maxPrizePerPlaceXlm} XLM per question.`;
  }
  const total = prizesStroops.reduce((a, b) => a + b, BigInt(0));
  if (Number.isFinite(caps.maxTotalPrizeXlm) && total > xlmToStroops(caps.maxTotalPrizeXlm))
    return `Limit: at most ${caps.maxTotalPrizeXlm} XLM in total per set (you set ${stroopsToXlm(total)} XLM).`;
  return null;
}

export function validateSetShape(size: number, kind: SessionKind, mainnet: boolean): string | null {
  if (!Number.isSafeInteger(size) || size < SET_LIMITS.min) return `A set needs at least ${SET_LIMITS.min} questions.`;
  const max = maxSetSize(kind, mainnet);
  if (size > max) return `A set can have at most ${max} questions${kind === "passkey" && mainnet ? " with a passkey account on mainnet" : ""}.`;
  return null;
}

// ---------- private sets: one salt per question in the link fragment ----------

/**
 * Private (unlisted) sets keep each chest's salt out of the server. The set link carries them all as
 * `#s=<salt0>.<salt1>.…` (index order). Public sets need no fragment.
 */
export function setSaltsFragment(salts: readonly string[]): string {
  return `#s=${salts.join(".")}`;
}

export function parseSetSalts(hash: string): (string | undefined)[] {
  const m = hash.match(/[#&]s=([^&]*)(?:&|$)/);
  if (!m) return [];
  return m[1].split(".").map((s) => (/^\d{1,80}$/.test(s) ? s : undefined));
}

/** Fragment for one member chest link (what chest-solve reads: `#s=<salt>`), or "" for public sets. */
export function chestSaltFragment(salts: readonly (string | undefined)[], index: number): string {
  const s = salts[index];
  return s ? `#s=${s}` : "";
}

// ---------- one Loot per account per set (OFF-CHAIN, sybil-able) ----------

export type SetClaimMarker = { chestId: number };

/**
 * Decision for a claim by `recipient` on a set chest, given the marker already stored for that
 * (set, recipient) pair:
 *  - no marker: reserve this chest for the account;
 *  - marker for the SAME chest: allow (a retry after a lost response; the contract nullifier still
 *    stops a double payout);
 *  - marker for another chest of the set: refuse.
 */
export function decideSetClaim(existing: SetClaimMarker | null, chestId: number): "reserve" | "same-chest" | "refuse" {
  if (!existing) return "reserve";
  return existing.chestId === chestId ? "same-chest" : "refuse";
}

export const SET_ALREADY_CLAIMED_CODE = "set_already_claimed";
export const SET_ALREADY_CLAIMED_MSG =
  "This account already claimed a chest from this set. Each account can claim one chest per set.";

// ---------- grouping for /explore ----------

export type SetRow = {
  id: number;
  status: "open" | "claimed" | "expired";
  prizeStroops: string;
  token: string;
  question: string;
  set?: SetRef;
};

export type ExploreItem<R extends SetRow> =
  | { kind: "chest"; row: R }
  | {
      kind: "set";
      setId: number;
      title: string;
      size: number;
      rows: R[]; // by question index
      status: R["status"];
      openCount: number;
      /** only when every member pays the same token */
      totalStroops: string | null;
      token: string;
    };

/** One card per set, one card per ordinary chest. Order follows the first appearance of each. */
export function groupSetRows<R extends SetRow>(rows: readonly R[]): ExploreItem<R>[] {
  const out: ExploreItem<R>[] = [];
  const sets = new Map<number, R[]>();
  for (const row of rows) {
    if (!row.set) {
      out.push({ kind: "chest", row });
      continue;
    }
    const cur = sets.get(row.set.id);
    if (cur) {
      cur.push(row);
      continue;
    }
    const members = [row];
    sets.set(row.set.id, members);
    // placeholder, filled below once all members are collected
    out.push({ kind: "set", setId: row.set.id, title: row.set.title, size: row.set.size, rows: members, status: row.status, openCount: 0, totalStroops: null, token: row.token });
  }
  for (const item of out) {
    if (item.kind !== "set") continue;
    item.rows.sort((a, b) => (a.set?.index ?? 0) - (b.set?.index ?? 0));
    item.openCount = item.rows.filter((r) => r.status === "open").length;
    item.status = item.openCount > 0 ? "open" : item.rows.every((r) => r.status === "claimed") ? "claimed" : "expired";
    const sameToken = item.rows.every((r) => r.token === item.token);
    item.totalStroops = sameToken ? item.rows.reduce((a, r) => a + BigInt(r.prizeStroops), BigInt(0)).toString() : null;
  }
  return out;
}
