import { describe, expect, it } from "vitest";
import { Account, Address, Asset, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { checkRelayable, type RelayPolicy } from "./relay-policy";

const PASS = Networks.PUBLIC;
const cid = (n: number) => StrKey.encodeContract(Buffer.alloc(32, n));
const REGISTRY = cid(1);
const SAC = Asset.native().contractId(PASS);
const OTHER = cid(9);
const WALLET = cid(7);
const WASM = "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";
const relayer = Keypair.random().publicKey();
const XLM = (n: number) => BigInt(Math.round(n * 1e7));
const NOW = 1_800_000_000;
const tokens: Record<number, string | null> = { 1: SAC, 2: OTHER, 3: SAC };
const base: RelayPolicy = {
  registry: REGISTRY,
  xlmSac: SAC,
  walletWasmHashHex: WASM,
  relayerPublicKey: relayer,
  chestToken: async (id) => tokens[id] ?? null,
  allowedChestIds: null,
};
const mainnet: RelayPolicy = {
  ...base,
  allowedChestIds: [1],
  createLimits: { maxPrizeStroops: XLM(1), maxTotalStroops: XLM(30), maxDeadlineSecs: 30 * 86400, nowSec: NOW },
};

const root = () =>
  new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: new Address(REGISTRY).toScAddress(), functionName: "x", args: [] }),
    ),
    subInvocations: [],
  });
const addrCred = (addr: string) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(addr).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: 100,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: root(),
  });
const srcCred = () =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: root(),
  });

const build = (op: xdr.Operation, source = Keypair.random().publicKey()) =>
  new TransactionBuilder(new Account(source, "1"), { fee: "100", networkPassphrase: PASS }).addOperation(op).setTimeout(30).build().toXDR();
const call = (contract: string, fn: string, args: xdr.ScVal[], auth?: xdr.SorobanAuthorizationEntry[]) =>
  Operation.invokeContractFunction({ contract, function: fn, args, auth });
const addr = (a: string) => new Address(a).toScVal();
const check = (x: string, p: RelayPolicy = base) => checkRelayable(x, PASS, p);
const u64 = (n: number) => nativeToScVal(BigInt(n), { type: "u64" });
const createArgs = (o: { creator?: string; token?: string; prize?: bigint; claims?: number; deadline?: number } = {}) => [
  addr(o.creator ?? WALLET),
  nativeToScVal(Buffer.alloc(32, 1)),
  addr(o.token ?? SAC),
  nativeToScVal(o.prize ?? XLM(1), { type: "i128" }),
  nativeToScVal(o.claims ?? 5, { type: "u32" }),
  u64(o.deadline ?? NOW + 86400),
];

const claimTx = (id = 1, auth?: xdr.SorobanAuthorizationEntry[], source?: string) => build(call(REGISTRY, "claim", [u64(id)], auth), source);

describe("relay policy", () => {
  it("create_chest: needs its creator's auth, 6 args, token = native XLM", async () => {
    const ok = (o = {}, auth = [addrCred(WALLET)]) => check(build(call(REGISTRY, "create_chest", createArgs(o), auth)));
    expect((await ok()).ok).toBe(true);
    expect((await ok({}, [])).ok).toBe(false);
    expect((await ok({ creator: OTHER })).ok).toBe(false);
    expect((await ok({ token: OTHER })).ok).toBe(false); // testnet too: no relayer burn on junk tokens
    expect((await check(build(call(REGISTRY, "create_chest", [addr(WALLET)], [addrCred(WALLET)])))).ok).toBe(false);
  });
  it("mainnet create_chest: prize, total and deadline caps", async () => {
    const m = (o = {}) => check(build(call(REGISTRY, "create_chest", createArgs(o), [addrCred(WALLET)])), mainnet);
    expect((await m({ prize: XLM(1), claims: 30 })).ok).toBe(true);
    expect((await m({ prize: XLM(1.5), claims: 1 })).ok).toBe(false);
    expect((await m({ prize: XLM(1), claims: 31 })).ok).toBe(false);
    expect((await m({ deadline: 0 })).ok).toBe(false);
    expect((await m({ deadline: NOW - 1 })).ok).toBe(false);
    expect((await m({ deadline: NOW + 31 * 86400 })).ok).toBe(false);
    expect((await m({ deadline: NOW + 30 * 86400 })).ok).toBe(true);
    // testnet keeps caps off
    expect((await check(build(call(REGISTRY, "create_chest", createArgs({ prize: XLM(500), deadline: 0 }), [addrCred(WALLET)])))).ok).toBe(true);
  });
  it("claim / close_chest: chest must exist and pay native XLM", async () => {
    expect((await check(claimTx(1))).ok).toBe(true);
    expect((await check(build(call(REGISTRY, "close_chest", [u64(3)])))).ok).toBe(true);
    expect((await check(claimTx(2))).ok).toBe(false); // token ajeno
    expect((await check(claimTx(99))).ok).toBe(false); // no existe
    expect((await check(build(call(REGISTRY, "claim", [])))).ok).toBe(false);
  });
  it("mainnet: claim / close_chest only for allowlisted ids", async () => {
    expect((await check(claimTx(1), mainnet)).ok).toBe(true);
    expect((await check(claimTx(3), mainnet)).ok).toBe(false); // XLM pero fuera de la lista
    expect((await check(build(call(REGISTRY, "close_chest", [u64(3)])), mainnet)).ok).toBe(false);
  });
  it("rejects init and unknown registry functions, and other contracts", async () => {
    for (const f of ["init", "set_admin", "upgrade"]) expect((await check(build(call(REGISTRY, f, [])))).ok).toBe(false);
    expect((await check(build(call(OTHER, "claim", [u64(1)])))).ok).toBe(false);
  });
  it("allows XLM transfer only from the authorizing wallet", async () => {
    const args = (f: string) => [addr(f), addr(OTHER), nativeToScVal(BigInt(10), { type: "i128" })];
    expect((await check(build(call(SAC, "transfer", args(WALLET), [addrCred(WALLET)])))).ok).toBe(true);
    expect((await check(build(call(SAC, "transfer", args(OTHER), [addrCred(WALLET)])))).ok).toBe(false);
    expect((await check(build(call(SAC, "approve", [addr(WALLET)], [addrCred(WALLET)])))).ok).toBe(false);
  });
  it("rejects source-account auth, multi-op, non-Soroban ops, fee-bump and the relayer as source", async () => {
    expect((await check(claimTx(1, [srcCred()]))).ok).toBe(false);
    const two = new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), { fee: "100", networkPassphrase: PASS })
      .addOperation(call(REGISTRY, "claim", [u64(1)])).addOperation(call(REGISTRY, "claim", [u64(1)])).setTimeout(30).build().toXDR();
    expect((await check(two)).ok).toBe(false);
    expect((await check(build(Operation.payment({ destination: relayer, asset: Asset.native(), amount: "1" })))).ok).toBe(false);
    expect((await check(claimTx(1, undefined, relayer))).ok).toBe(false);
    const inner = TransactionBuilder.fromXDR(claimTx(1), PASS);
    const fb = TransactionBuilder.buildFeeBumpTransaction(Keypair.random(), "1000", inner as never, PASS);
    expect((await check(fb.toXDR())).ok).toBe(false);
  });
  it("wallet deploy only with the Loot wallet wasm", async () => {
    const dep = (hash: string) =>
      build(Operation.createCustomContract({ address: new Address(Keypair.random().publicKey()), wasmHash: Buffer.from(hash, "hex"), salt: Buffer.alloc(32, 1) }));
    const v = await check(dep(WASM));
    expect(v.ok && v.kind).toBe("wallet_deploy");
    expect((await check(dep("aa".repeat(32)))).ok).toBe(false);
  });
  it("rejects garbage", async () => expect((await check("AAAA")).ok).toBe(false));
});
