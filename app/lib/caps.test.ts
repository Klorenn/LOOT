import { describe, expect, it } from "vitest";
import { capError } from "./caps";

const X = (n: number) => BigInt(Math.round(n * 1e7));
const caps = { maxPrizePerPlaceXlm: 1, maxTotalPrizeXlm: 30 };

describe("capError", () => {
  it("allows 30 claims × 1 XLM", () => expect(capError(X(1), 30, caps)).toBeNull());
  it("rejects a per-claim prize above the cap", () =>
    expect(capError(X(1.5), 5, caps)).toMatch(/1 XLM per claim/));
  it("rejects a total above the cap", () =>
    expect(capError(X(1), 31, caps)).toMatch(/30 XLM in total/));
  it("is a no-op when caps are infinite (testnet)", () =>
    expect(capError(X(1000), 100, { maxPrizePerPlaceXlm: Infinity, maxTotalPrizeXlm: Infinity })).toBeNull());
});
