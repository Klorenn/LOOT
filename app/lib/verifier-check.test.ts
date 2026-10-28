import { beforeEach, describe, expect, it, vi } from "vitest";
import { blocksRelay, checkRegistryVerifier, resetVerifierGuard, verifierGuard } from "./verifier-check";

const V = "CVERIFIER";
const base = { mainnet: true, registryId: "CREG", expectedVerifier: V, getter: "get_verifier" };
beforeEach(() => resetVerifierGuard());

describe("checkRegistryVerifier", () => {
  it("is skipped on testnet and never reads", async () => {
    const read = vi.fn();
    expect(await checkRegistryVerifier({ ...base, mainnet: false, read })).toEqual({ status: "skipped", reason: "testnet" });
    expect(read).not.toHaveBeenCalled();
  });
  it("is a no-op while the registry has no getter (current mainnet registry)", async () => {
    const read = vi.fn();
    expect(await checkRegistryVerifier({ ...base, getter: undefined, read })).toEqual({ status: "unsupported" });
    expect(read).not.toHaveBeenCalled();
  });
  it("matches", async () => {
    expect(await checkRegistryVerifier({ ...base, read: async () => V })).toEqual({ status: "match" });
  });
  it("detects a mismatch and blocks relaying", async () => {
    const r = await checkRegistryVerifier({ ...base, read: async () => "COTHER" });
    expect(r.status).toBe("mismatch");
    expect(blocksRelay(r)).toBe(true);
  });
  it("treats a missing function as unsupported", async () => {
    const read = async () => {
      throw new Error("HostError: Error(WasmVm, MissingValue) trying to invoke non-existent contract function");
    };
    expect(await checkRegistryVerifier({ ...base, read })).toEqual({ status: "unsupported" });
  });
  it("an RPC error does not block relaying", async () => {
    const r = await checkRegistryVerifier({ ...base, read: async () => Promise.reject(new Error("fetch failed")) });
    expect(r.status).toBe("error");
    expect(blocksRelay(r)).toBe(false);
  });
});

describe("verifierGuard cache", () => {
  it("reads once within the TTL and re-reads errors sooner", async () => {
    const read = vi.fn().mockResolvedValue(V);
    await verifierGuard({ ...base, read }, 1000);
    await verifierGuard({ ...base, read }, 2000);
    expect(read).toHaveBeenCalledTimes(1);
    resetVerifierGuard();
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    await verifierGuard({ ...base, read: bad }, 0);
    await verifierGuard({ ...base, read: bad }, 31_000);
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
