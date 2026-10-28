import { afterEach, describe, expect, it } from "vitest";
import { relayMaxFee } from "./relay-fee-cap";

const T = { IS_MAINNET: false };
const M = { IS_MAINNET: true };
afterEach(() => {
  delete process.env.RELAY_MAX_FEE_STROOPS;
  delete process.env.RELAY_MAX_DEPLOY_FEE_STROOPS;
  delete process.env.RELAY_MAX_FEE_STROOPS_MAINNET;
});

describe("relayMaxFee", () => {
  it("testnet ordinary txs are capped at 10 XLM, not 600", () => {
    for (const k of ["claim", "create_chest", "close_chest", "transfer"] as const) expect(relayMaxFee(T, k)).toBe(BigInt(100_000_000));
    expect(relayMaxFee(T)).toBe(BigInt(100_000_000));
  });
  it("testnet wallet deploy keeps headroom above the observed 4.29e9 rent", () => {
    expect(relayMaxFee(T, "wallet_deploy")).toBeGreaterThan(BigInt(4_290_000_000));
  });
  it("mainnet defaults are unchanged and ignore testnet variables", () => {
    process.env.RELAY_MAX_FEE_STROOPS = "999999999999";
    expect(relayMaxFee(M, "claim")).toBe(BigInt(3_000_000));
    expect(relayMaxFee(M, "wallet_deploy")).toBe(BigInt(10_000_000));
  });
  it("env overrides apply per network", () => {
    process.env.RELAY_MAX_FEE_STROOPS = "5000000";
    expect(relayMaxFee(T, "claim")).toBe(BigInt(5_000_000));
    process.env.RELAY_MAX_DEPLOY_FEE_STROOPS = "7000000000";
    expect(relayMaxFee(T, "wallet_deploy")).toBe(BigInt(7_000_000_000));
  });
});
