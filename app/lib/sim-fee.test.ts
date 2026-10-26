import { describe, expect, it } from "vitest";
import { resourceFeeOf } from "./sim-fee";

describe("resourceFeeOf", () => {
  it("reads xdr-style transactionData", () => {
    expect(resourceFeeOf({ simulationData: { transactionData: { resourceFee: () => ({ toString: () => "1234" }) } } })).toBe(BigInt(1234));
  });
  it("reads builder-style transactionData", () => {
    const td = { build: () => ({ resourceFee: () => ({ toString: () => "99" }) }) };
    expect(resourceFeeOf({ simulationData: { transactionData: td } })).toBe(BigInt(99));
  });
  it("returns null without a simulation", () => {
    expect(resourceFeeOf({})).toBeNull();
    expect(resourceFeeOf(undefined)).toBeNull();
  });
});
