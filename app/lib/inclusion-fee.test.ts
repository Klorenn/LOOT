import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearInclusionFeeCache, inclusionFee, pickInclusionFee } from "./inclusion-fee";

describe("pickInclusionFee", () => {
  it("mainnet: max(p90, 200), capped at 20,000", () => {
    expect(pickInclusionFee("150", true)).toBe(BigInt(200));
    expect(pickInclusionFee("200", true)).toBe(BigInt(200));
    expect(pickInclusionFee("5000", true)).toBe(BigInt(5000));
    expect(pickInclusionFee("999999", true)).toBe(BigInt(20_000));
    expect(pickInclusionFee(undefined, true)).toBe(BigInt(200));
    expect(pickInclusionFee("not-a-number", true)).toBe(BigInt(200));
  });
  it("testnet keeps the minimum 100", () => {
    expect(pickInclusionFee("5000", false)).toBe(BigInt(100));
  });
});

describe("inclusionFee from getFeeStats", () => {
  beforeEach(() => clearInclusionFeeCache());
  const main = { net: "mainnet", IS_MAINNET: true };

  it("reads sorobanInclusionFee.p90 and caches it for 30 s", async () => {
    const getFeeStats = vi.fn().mockResolvedValue({ sorobanInclusionFee: { p90: "1234" } });
    expect(await inclusionFee({ getFeeStats }, main, 1_000)).toBe(BigInt(1234));
    expect(await inclusionFee({ getFeeStats }, main, 20_000)).toBe(BigInt(1234)); // dentro de 30 s: caché
    expect(getFeeStats).toHaveBeenCalledTimes(1);
    getFeeStats.mockResolvedValue({ sorobanInclusionFee: { p90: "300" } });
    expect(await inclusionFee({ getFeeStats }, main, 40_000)).toBe(BigInt(300)); // caducó: se vuelve a leer
    expect(getFeeStats).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last known value, then to 200, when the RPC fails", async () => {
    const ok = vi.fn().mockResolvedValue({ sorobanInclusionFee: { p90: "700" } });
    await inclusionFee({ getFeeStats: ok }, main, 0);
    const bad = vi.fn().mockRejectedValue(new Error("rpc down"));
    expect(await inclusionFee({ getFeeStats: bad }, main, 100_000)).toBe(BigInt(700));
    clearInclusionFeeCache();
    expect(await inclusionFee({ getFeeStats: bad }, main, 200_000)).toBe(BigInt(200));
  });

  it("testnet never queries the RPC and stays at 100", async () => {
    const getFeeStats = vi.fn();
    expect(await inclusionFee({ getFeeStats }, { net: "testnet", IS_MAINNET: false })).toBe(BigInt(100));
    expect(getFeeStats).not.toHaveBeenCalled();
  });
});
