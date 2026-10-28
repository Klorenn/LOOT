import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const conf = {
  IS_MAINNET: false,
  net: "testnet",
  NETWORK: { passphrase: "p" },
  CONTRACTS: { chest: "" },
  REGISTRY_V2: { chest: StrKey.encodeContract(Buffer.alloc(32, 3)) },
  XLM_SAC: "SAC",
  ALLOWED_CHEST_IDS: null,
  CREATOR_ALLOWLIST: [],
};
const gate = vi.fn();
const readChest = vi.fn();
const wasmHash = vi.fn();
vi.mock("@/lib/cfg", () => ({ cfg: async () => conf }));
vi.mock("@/lib/relay-gate", () => ({ relayGate: (...a: unknown[]) => gate(...a) }));
vi.mock("@/lib/rate-limit", () => ({ relayLimit: () => false }));
vi.mock("@/lib/relay-guard", () => ({ relayMaxFee: () => BigInt(1), relayerSecretFor: () => Keypair.random().secret() }));
vi.mock("@/lib/relay-limits", () => ({ decideSponsor: () => ({ ok: true }), relayerBalance: async () => BigInt(1e12), reserveFee: () => () => {} }));
vi.mock("@/lib/chain", () => ({ readChest: (...a: unknown[]) => readChest(...a) }));
vi.mock("@/lib/rpc", () => ({ withRpcUrl: (fn: (u: string) => unknown) => fn("http://rpc") }));
vi.mock("@/lib/claim-recipient", async (orig) => ({
  ...(await orig<typeof import("@/lib/claim-recipient")>()),
  contractWasmHash: (...a: unknown[]) => wasmHash(...a),
}));

const prepare = vi.fn();
vi.mock("@findloot/chest", async (orig) => ({
  ...(await orig<typeof import("@findloot/chest")>()),
  prepareClaimAuth: (...a: unknown[]) => prepare(...a),
}));

import { POST } from "@/app/api/claim/route";
import { WALLET_WASM_HASH } from "@/lib/network";

const hex = (n: number) => "ab".repeat(n);
const V2_REF = 1_000_000_021;
const body = (over: Record<string, unknown> = {}) => ({
  chestId: V2_REF,
  recipient: Keypair.random().publicKey(),
  nullifierHex: hex(32),
  proof: { a: hex(64), b: hex(128), c: hex(64) },
  phase: "prepare",
  ...over,
});
const req = (b: unknown) => new Request("http://x/api/claim", { method: "POST", body: JSON.stringify(b) }) as never;

describe("/api/claim v2 flow guards", () => {
  beforeEach(() => {
    conf.IS_MAINNET = false;
    gate.mockReset().mockResolvedValue({ ok: false, res: NextResponse.json({ code: "rate_limited" }, { status: 429 }) });
    readChest.mockReset().mockResolvedValue({ token: "SAC", creator: "G" });
    wasmHash.mockReset();
  });

  it("mainnet: phase/signedAuthEntry are refused before the gate and before any RPC", async () => {
    conf.IS_MAINNET = true;
    expect((await POST(req(body()))).status).toBe(400);
    expect((await POST(req(body({ phase: undefined, signedAuthEntry: "AAAA" })))).status).toBe(400);
    expect(gate).not.toHaveBeenCalled();
    expect(readChest).not.toHaveBeenCalled();
  });

  it("testnet v1 chest: phase is refused before the gate and before any RPC", async () => {
    expect((await POST(req(body({ chestId: 5 })))).status).toBe(400);
    expect(gate).not.toHaveBeenCalled();
    expect(readChest).not.toHaveBeenCalled();
  });

  it("testnet v2 prepare goes through the persistent gate", async () => {
    expect((await POST(req(body()))).status).toBe(429);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(readChest).not.toHaveBeenCalled();
  });

  it("testnet v2: a C recipient that is not the passkey wallet wasm is not sponsored", async () => {
    gate.mockResolvedValue({ ok: true, release: async () => undefined });
    wasmHash.mockResolvedValue("00".repeat(32));
    const r = await POST(req(body({ recipient: StrKey.encodeContract(Buffer.alloc(32, 9)) })));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("recipient_not_supported");
    // unknown contract (RPC says nothing) is refused too
    wasmHash.mockResolvedValue(null);
    expect((await POST(req(body({ recipient: StrKey.encodeContract(Buffer.alloc(32, 8)) })))).status).toBe(403);
  });

  it("testnet v2: the passkey wallet wasm passes the recipient check", async () => {
    gate.mockResolvedValue({ ok: true, release: async () => undefined });
    wasmHash.mockResolvedValue(WALLET_WASM_HASH);
    prepare.mockResolvedValue({ authEntry: "AAAA", latestLedger: 1, validUntilLedger: 61 });
    const r = await POST(req(body({ recipient: StrKey.encodeContract(Buffer.alloc(32, 7)) })));
    expect(r.status).toBe(200);
    expect((await r.json()).authEntry).toBe("AAAA");
    expect(wasmHash).toHaveBeenCalledTimes(1);
  });
});
