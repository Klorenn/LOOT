import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const creator = Keypair.random();
const conf = {
  IS_MAINNET: false,
  NETWORK: { passphrase: "p", explorerUrl: "http://e" },
  CONTRACTS: { chest: StrKey.encodeContract(Buffer.alloc(32, 1)) },
  REGISTRY_V2: { chest: "" },
};
const readChest = vi.fn();
vi.mock("@/lib/cfg", () => ({ cfg: async () => conf }));
vi.mock("@/lib/mainnet-guard", () => ({ legacyOff: async () => null }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: () => null }));
vi.mock("@/lib/chain", () => ({ readChest: (...a: unknown[]) => readChest(...a) }));
vi.mock("@/lib/rpc", () => ({ withRpcUrl: vi.fn() }));

import { POST } from "@/app/api/chests/[id]/close/route";
import { withRpcUrl } from "@/lib/rpc";

const V2 = 1_000_000_000;
const call = (id: number) =>
  POST({} as never, { params: Promise.resolve({ id: String(id) }) });

describe("POST /api/chests/[id]/close preflight", () => {
  beforeEach(() => {
    process.env.CREATOR_SECRET = creator.secret();
    conf.REGISTRY_V2.chest = "";
    readChest.mockReset();
    vi.mocked(withRpcUrl).mockReset();
  });

  it("v2 ref while v2 is not configured: clear 404, not a generic 500", async () => {
    const res = await call(V2 + 60);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_created" });
    expect(readChest).not.toHaveBeenCalled();
    expect(withRpcUrl).not.toHaveBeenCalled();
  });

  it("legacy ref (previous registry): 409 legacy_registry, nothing read or signed", async () => {
    conf.REGISTRY_V2.chest = StrKey.encodeContract(Buffer.alloc(32, 2));
    const res = await call(V2 + 7);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "legacy_registry" });
    expect(readChest).not.toHaveBeenCalled();
    expect(withRpcUrl).not.toHaveBeenCalled();
  });

  it("ChestNotFound on the registry still gives the 404 not_created", async () => {
    conf.REGISTRY_V2.chest = StrKey.encodeContract(Buffer.alloc(32, 2));
    readChest.mockRejectedValue(new Error("Error(Contract, #1)"));
    const res = await call(V2 + 60);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_created" });
  });
});
