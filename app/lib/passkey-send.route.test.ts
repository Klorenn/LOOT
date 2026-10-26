import { beforeEach, describe, expect, it, vi } from "vitest";
import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";
import { configFor, type MainnetPublic } from "./network";
import { SIGNUP_UNAVAILABLE } from "./passkey-relay";

/**
 * /api/passkey/send con la red, el relayer y la simulación simulados (no depende de un relayer de mainnet):
 *  - tope de fee superado en el deploy de wallet de mainnet → 503 con mensaje claro + cupo de registro devuelto;
 *  - sin MAINNET_PASSKEY_ENABLED el 403 es idéntico, byte a byte, al de main.
 */

const REG = "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV";
const VER = "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE";
const mainnetPublic: MainnetPublic = {
  registry: REG, verifier: VER, rpcUrl: "https://rpc.example", horizonUrl: "", maxPrizePerPlaceXlm: 1,
  maxTotalPrizeXlm: 30, sampleChestId: 1, listedIds: [1], creatorAllowlist: [], passkeyEnabled: true,
};

const h = vi.hoisted(() => ({
  cfg: vi.fn(),
  sim: { minResourceFee: "494028463", transactionData: {} } as Record<string, unknown>,
  verdictKind: "wallet_deploy" as string,
  slotRelease: vi.fn(),
  feeRelease: vi.fn(),
}));

vi.mock("@/lib/cfg", () => ({ cfg: h.cfg }));
vi.mock("@/lib/rpc", () => ({ pickRpcUrl: async () => "http://rpc.test" }));
vi.mock("@/lib/rate-limit", () => ({ relayLimit: () => null }));
vi.mock("@/lib/relay-guard", async (orig) => ({
  ...(await orig<typeof import("./relay-guard")>()),
  vetRelayTx: async () => ({ ok: true, kind: h.verdictKind, resourceFee: BigInt(0) }),
  relayerSecretFor: () => Keypair.random().secret(),
}));
vi.mock("@/lib/relay-limits", () => ({
  decideSponsor: () => ({ ok: true }),
  relayerBalance: async () => BigInt(10) ** BigInt(12),
  reserveFee: () => h.feeRelease,
  reserveRegistration: async () => ({ release: h.slotRelease }),
}));
vi.mock("@stellar/stellar-sdk/rpc", async (orig) => ({
  ...(await orig<typeof import("@stellar/stellar-sdk/rpc")>()),
  Server: class {
    getAccount = async (id: string) => new Account(id, "1");
    simulateTransaction = async () => h.sim;
  },
}));

const { POST } = await import("../app/api/passkey/send/route");

/** Una tx con una sola operación invokeHostFunction y sin auth de cuenta fuente (lo que el relay reconstruye). */
function signedXdr(): string {
  const src = Keypair.random();
  const func = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32) as never),
      functionName: "noop",
      args: [],
    }),
  );
  return new TransactionBuilder(new Account(src.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.invokeHostFunction({ func, auth: [] }))
    .setTimeout(30)
    .build()
    .toXDR();
}

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/passkey/send", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.restoreAllMocks();
  h.slotRelease.mockClear();
  h.feeRelease.mockClear();
  h.verdictKind = "wallet_deploy";
  h.sim = { minResourceFee: "494028463", transactionData: {} };
  h.cfg.mockResolvedValue(configFor("mainnet", mainnetPublic));
});

describe("mainnet wallet deploy over the fee cap", () => {
  it("answers 503 with the clear signup message, returns the registration slot and logs minResourceFee", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await post({ xdr: signedXdr() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: SIGNUP_UNAVAILABLE, code: "passkey_signup_unavailable" });
    expect(SIGNUP_UNAVAILABLE).toBe("Passkey signup is temporarily unavailable on Mainnet — connect a Stellar wallet");
    expect(h.slotRelease).toHaveBeenCalledTimes(1); // el cupo de registro vuelve
    expect(h.feeRelease).toHaveBeenCalled(); // la fee en vuelo también se libera
    expect(warn.mock.calls.flat().join(" ")).toContain("494028463");
    const structured = info.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    expect(structured).toContainEqual(
      expect.objectContaining({ event: "passkey_wallet_deploy", net: "mainnet", stage: "simulated", minResourceFee: "494028463", overCap: true, capStroops: "10000000" }),
    );
  });

  it("non-deploy forms over the cap get a generic fee_cap 503, not the signup message", async () => {
    h.verdictKind = "chest_create";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await post({ xdr: signedXdr() });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("fee_cap");
  });
});

describe("MAINNET_PASSKEY_ENABLED absent (default off)", () => {
  it("keeps main's exact 403 response on mainnet, byte for byte", async () => {
    h.cfg.mockResolvedValue(configFor("mainnet", { ...mainnetPublic, passkeyEnabled: false }));
    const res = await post({ xdr: signedXdr() });
    expect(res.status).toBe(403);
    // literal copiado de origin/main (app/app/api/passkey/send/route.ts)
    expect(await res.text()).toBe(
      '{"error":"Passkey accounts are testnet-only for now. Connect a Stellar wallet on Mainnet.","code":"passkey_testnet_only"}',
    );
  });

  it("does not gate testnet", async () => {
    h.cfg.mockResolvedValue(configFor("testnet", { ...mainnetPublic, passkeyEnabled: false }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ xdr: signedXdr() });
    // la compuerta de passkeys es solo de mainnet: en testnet nunca responde passkey_testnet_only
    expect(await res.text()).not.toContain("passkey_testnet_only");
  });
});
