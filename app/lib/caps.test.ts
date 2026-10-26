import { describe, expect, it } from "vitest";
import { capError, capHint, clampClaims, perClaimError } from "./caps";

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

describe("perClaimError (step 2: only the per-claim cap)", () => {
  it("ignores the total, so a template with 100 claims does not block the reward step", () => {
    expect(perClaimError(X(1), caps)).toBeNull();
    expect(capError(X(1), 100, caps)).toMatch(/30 XLM in total/); // el total se valida en claims/submit
  });
  it("rejects a prize above the per-claim cap", () => expect(perClaimError(X(2), caps)).toMatch(/1 XLM per claim/));
});

describe("clampClaims", () => {
  it("keeps floor(total / prize) claims at most", () => {
    expect(clampClaims(X(1), 100, caps)).toBe(30);
    expect(clampClaims(X(1), 10, caps)).toBe(10);
    expect(clampClaims(X(0.4), 100, caps)).toBe(75);
  });
  it("never goes below 1, and is a no-op without caps", () => {
    expect(clampClaims(X(50), 5, caps)).toBe(1);
    expect(clampClaims(X(1), 100, { maxPrizePerPlaceXlm: Infinity, maxTotalPrizeXlm: Infinity })).toBe(100);
  });
});

describe("capHint", () => {
  it("is empty without caps and explains the beta limits otherwise", () => {
    expect(capHint({ maxPrizePerPlaceXlm: Infinity, maxTotalPrizeXlm: Infinity })).toBeNull();
    expect(capHint(caps)).toBe("Beta: up to 30 XLM total · 1 XLM per claim");
  });
});
