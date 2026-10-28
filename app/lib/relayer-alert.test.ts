import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOW_BALANCE_TAG, checkRelayerBalance, isLow, lowBalanceThresholdStroops, resetAlertThrottle } from "./relayer-alert";

const T = { IS_MAINNET: false, net: "testnet", NETWORK: {} } as never;
const XLM = (n: number) => BigInt(n * 1e7);

describe("relayer low-balance alert", () => {
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetAlertThrottle();
    err = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    err.mockRestore();
    delete process.env.RELAYER_LOW_BALANCE_WEBHOOK;
    delete process.env.RELAYER_LOW_BALANCE_XLM;
  });

  it("thresholds: testnet 500 XLM, mainnet 10 XLM by default", () => {
    expect(lowBalanceThresholdStroops(false)).toBe(XLM(500));
    expect(lowBalanceThresholdStroops(true)).toBe(XLM(10));
    expect(isLow(null, XLM(1))).toBe(true);
  });

  it("logs one tagged JSON line and posts the webhook when low, throttled", async () => {
    process.env.RELAYER_LOW_BALANCE_WEBHOOK = "https://hooks.example/x";
    const fetch = vi.fn(async () => new Response("ok"));
    const r = await checkRelayerBalance(T, "GABC", { balance: async () => XLM(12), fetch: fetch as never, now: 1 });
    expect(r.low).toBe(true);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toBe(LOW_BALANCE_TAG);
    expect(JSON.parse(err.mock.calls[0][1] as string)).toMatchObject({ net: "testnet", balanceXlm: 12, thresholdXlm: 500 });
    expect(fetch).toHaveBeenCalledWith("https://hooks.example/x", expect.objectContaining({ method: "POST" }));
    await checkRelayerBalance(T, "GABC", { balance: async () => XLM(12), fetch: fetch as never, now: 2 });
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("stays quiet above the threshold", async () => {
    const r = await checkRelayerBalance(T, "GABC", { balance: async () => XLM(9000), now: 1 });
    expect(r.low).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });
});
