import { describe, expect, it } from "vitest";
import { expiryError } from "./expiry";
import { MAX_DEADLINE_SECS } from "./registry";
import { testnetFeatures } from "./testnet-features";

const NOW = 1_800_000_000_000;
const at = (secs: number) => new Date(NOW + secs * 1000).toISOString();

describe("expiryError testnet bound", () => {
  it("keeps a margin under the contract's 90-day bound", () => {
    expect(expiryError(at(MAX_DEADLINE_SECS - 3600), false, NOW)).toBeNull();
    expect(expiryError(at(MAX_DEADLINE_SECS - 3599), false, NOW)).toMatch(/90 days/);
    expect(expiryError(at(MAX_DEADLINE_SECS), false, NOW)).toMatch(/90 days/);
  });
  it("mainnet stays at 30 days", () => {
    expect(expiryError(at(30 * 24 * 3600), true, NOW)).toBeNull();
    expect(expiryError(at(30 * 24 * 3600 + 5), true, NOW)).toMatch(/30 days/);
  });
});

describe("testnetFeatures", () => {
  it("is on for testnet and off for mainnet", () => {
    expect(testnetFeatures({ IS_MAINNET: false })).toBe(true);
    expect(testnetFeatures({ IS_MAINNET: true })).toBe(false);
  });
});
