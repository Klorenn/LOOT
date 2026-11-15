/**
 * Testnet listing rules for the public listings (/explore). They shape what the app SHOWS; the contract does not
 * enforce them and anyone can still open a chest by link. Pure module (unit-tested).
 *  - only chests paying at least 1 XLM per place are listed;
 *  - at most 5 open chests per creator are listed (the oldest ones; closed, sold out and expired chests neither
 *    count nor get cut).
 */
export const MIN_LISTED_PRIZE_STROOPS = BigInt(10_000_000);
export const MAX_OPEN_PER_CREATOR = 5;

type Listable = { id: number; creator: string; prize: bigint; closed: boolean; claims: number; maxClaims: number; deadline: number };

const isOpen = (c: Listable, nowSec: number) => !c.closed && c.claims < c.maxClaims && !(c.deadline && c.deadline < nowSec);

/** Chests that pass the rules, oldest id first. */
export function applyTestnetListingRules<T extends Listable>(chests: readonly T[], nowSec: number = Math.floor(Date.now() / 1000)): T[] {
  const openPerCreator = new Map<string, number>();
  const out: T[] = [];
  for (const c of [...chests].sort((a, b) => a.id - b.id)) {
    if (c.prize < MIN_LISTED_PRIZE_STROOPS) continue;
    if (isOpen(c, nowSec)) {
      const n = openPerCreator.get(c.creator) ?? 0;
      if (n >= MAX_OPEN_PER_CREATOR) continue;
      openPerCreator.set(c.creator, n + 1);
    }
    out.push(c);
  }
  return out;
}
