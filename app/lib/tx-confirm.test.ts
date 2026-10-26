import { describe, expect, it, vi } from "vitest";
import { TxFailedError, TxPendingError, waitForConfirmation, waitSeconds } from "./tx-confirm";
import { PasskeyTxPendingError, WalletNotDeployedError, assertWalletDeployed, postPasskeyTx } from "./passkey-submit";

const fast = { intervalMs: 0, sleep: async () => {} };

describe("waitForConfirmation (relay)", () => {
  it("resolves once the tx is SUCCESS", async () => {
    const get = vi.fn().mockResolvedValueOnce({ status: "NOT_FOUND" }).mockResolvedValue({ status: "SUCCESS" });
    expect(await waitForConfirmation(get, "abc", { attempts: 5, ...fast })).toEqual({ hash: "abc" });
  });
  it("never reports ok for an unconfirmed tx: throws TxPendingError with the hash", async () => {
    const get = vi.fn().mockResolvedValue({ status: "NOT_FOUND" });
    await expect(waitForConfirmation(get, "deadbeef", { attempts: 3, ...fast })).rejects.toMatchObject({ name: "TxPendingError", hash: "deadbeef" });
    expect(get).toHaveBeenCalledTimes(3);
    await expect(waitForConfirmation(get, "x", { attempts: 1, ...fast })).rejects.toBeInstanceOf(TxPendingError);
  });
  it("FAILED is a failure, and a flaky RPC read counts as not found yet", async () => {
    await expect(waitForConfirmation(async () => ({ status: "FAILED" }), "h", { attempts: 2, ...fast })).rejects.toBeInstanceOf(TxFailedError);
    const get = vi.fn().mockRejectedValueOnce(new Error("rpc")).mockResolvedValue({ status: "SUCCESS" });
    expect(await waitForConfirmation(get, "h", { attempts: 3, ...fast })).toEqual({ hash: "h" });
  });
  it("waits longer on mainnet", () => {
    expect(waitSeconds(true)).toBe(90);
    expect(waitSeconds(false)).toBe(40);
  });
});

describe("client: a pending/unconfirmed deploy never creates a session", () => {
  const stubFetch = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }));

  it("postPasskeyTx throws PasskeyTxPendingError for tx_pending (ok:false) and for legacy ok+pending", async () => {
    stubFetch(504, { ok: false, code: "tx_pending", hash: "ab12" });
    await expect(postPasskeyTx("xdr")).rejects.toMatchObject({ name: "PasskeyTxPendingError", hash: "ab12" });
    stubFetch(200, { ok: true, hash: "cd34", pending: true });
    await expect(postPasskeyTx("xdr")).rejects.toBeInstanceOf(PasskeyTxPendingError);
    stubFetch(200, { ok: true, hash: "ok1" });
    await expect(postPasskeyTx("xdr")).resolves.toBe("ok1");
    vi.unstubAllGlobals();
  });

  it("assertWalletDeployed throws WalletNotDeployedError when the instance never shows up (so nothing is saved)", async () => {
    const exists = vi.fn().mockResolvedValue(false);
    await expect(assertWalletDeployed(exists, { attempts: 3, ...fast })).rejects.toBeInstanceOf(WalletNotDeployedError);
    expect(exists).toHaveBeenCalledTimes(3);
    const rpcFlaky = vi.fn().mockRejectedValueOnce(new Error("rpc")).mockResolvedValueOnce(false).mockResolvedValue(true);
    await expect(assertWalletDeployed(rpcFlaky, { attempts: 5, ...fast })).resolves.toBeUndefined();
    expect(new WalletNotDeployedError().message).toBe("Your account wasn’t created yet — please try again.");
  });
});
