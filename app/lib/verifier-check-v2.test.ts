import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERIFIER_GETTER, blocksRelay, checkRegistryVerifier, resetVerifierGuard, verifierGuard } from "./verifier-check";

const V = "CVERIFIER";
beforeEach(() => resetVerifierGuard());

describe("verifier check for registry v2", () => {
  it("the default getter is verifier() so the mismatch check is active", () => {
    expect(VERIFIER_GETTER).toBe("verifier");
  });

  it("v2 registry whose verifier() matches", async () => {
    const read = vi.fn().mockResolvedValue(V);
    expect(await checkRegistryVerifier({ mainnet: true, registryId: "CV2", expectedVerifier: V, read })).toEqual({ status: "match" });
    expect(read).toHaveBeenCalledWith("CV2", "verifier");
  });

  it("v2 registry whose verifier() differs blocks relaying", async () => {
    const r = await checkRegistryVerifier({ mainnet: true, registryId: "CV2", expectedVerifier: V, read: async () => "COTHER" });
    expect(r.status).toBe("mismatch");
    expect(blocksRelay(r)).toBe(true);
  });

  it("v1 registry has no verifier(): unsupported, does not block", async () => {
    const read = async () => {
      throw new Error("HostError: Error(WasmVm, MissingValue) trying to invoke non-existent contract function");
    };
    const r = await checkRegistryVerifier({ mainnet: true, registryId: "CV1", expectedVerifier: V, read });
    expect(r).toEqual({ status: "unsupported" });
    expect(blocksRelay(r)).toBe(false);
  });

  it("v1 and v2 results are cached independently", async () => {
    const readV1 = vi.fn().mockRejectedValue(new Error("non-existent contract function"));
    const readV2 = vi.fn().mockResolvedValue("COTHER");
    const a = await verifierGuard({ mainnet: true, registryId: "CV1", expectedVerifier: V, read: readV1 }, 1000);
    const b = await verifierGuard({ mainnet: true, registryId: "CV2", expectedVerifier: V, read: readV2 }, 1000);
    expect(a.status).toBe("unsupported");
    expect(b.status).toBe("mismatch");
    // v1's cached "unsupported" must not hide v2's mismatch on the next request
    const b2 = await verifierGuard({ mainnet: true, registryId: "CV2", expectedVerifier: V, read: readV2 }, 2000);
    expect(b2.status).toBe("mismatch");
    expect(readV2).toHaveBeenCalledTimes(1);
  });

  it("testnet is still skipped", async () => {
    const read = vi.fn();
    expect(await checkRegistryVerifier({ mainnet: false, registryId: "CV2", expectedVerifier: V, read })).toEqual({ status: "skipped", reason: "testnet" });
    expect(read).not.toHaveBeenCalled();
  });
});
