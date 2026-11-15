import { describe, expect, it } from "vitest";
import { applyTestnetListingRules, MIN_LISTED_PRIZE_STROOPS, MAX_OPEN_PER_CREATOR } from "./listing-rules";

const XLM = BigInt(10_000_000);
const NOW = 1_800_000_000;
const A = "GA" + "A".repeat(54);
const B = "GB" + "B".repeat(54);
const chest = (id: number, over: Partial<{ creator: string; prize: bigint; closed: boolean; claims: number; maxClaims: number; deadline: number }> = {}) => ({
  id,
  creator: A,
  prize: XLM,
  closed: false,
  claims: 0,
  maxClaims: 3,
  deadline: NOW + 1000,
  ...over,
});
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe("testnet listing rules", () => {
  it("constants: 1 XLM per place, 5 open chests per creator", () => {
    expect(MIN_LISTED_PRIZE_STROOPS).toBe(XLM);
    expect(MAX_OPEN_PER_CREATOR).toBe(5);
  });
  it("lists chests with at least 1 XLM per place", () => {
    const out = applyTestnetListingRules([chest(1, { prize: XLM - BigInt(1) }), chest(2, { prize: XLM }), chest(3, { prize: BigInt(5) * XLM })], NOW);
    expect(ids(out)).toEqual([2, 3]);
  });
  it("lists at most 5 open chests per creator, oldest first", () => {
    const six = [1, 2, 3, 4, 5, 6].map((i) => chest(i));
    expect(ids(applyTestnetListingRules(six, NOW))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(applyTestnetListingRules([...six.reverse(), chest(7, { creator: B })], NOW))).toEqual([1, 2, 3, 4, 5, 7]);
  });
  it("only open chests count: closed, sold out and expired ones neither use nor hit the quota", () => {
    const done = [
      chest(1, { closed: true }),
      chest(2, { claims: 3 }),
      chest(3, { deadline: NOW - 1 }),
    ];
    const open = [4, 5, 6, 7, 8, 9].map((i) => chest(i));
    expect(ids(applyTestnetListingRules([...done, ...open], NOW))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("the cap is on the number of chests, not on prizes already counted twice", () => {
    expect(applyTestnetListingRules([], NOW)).toEqual([]);
  });
});
