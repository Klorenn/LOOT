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
const policy: RelayPolicy = { registry: REGISTRY, xlmSac: SAC, walletWasmHashHex: WASM, relayerPublicKey: relayer };

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
const check = (x: string) => checkRelayable(x, PASS, policy);

describe("relay policy", () => {
  it("allows create_chest authorized by its creator, rejects an unauthorized creator", () => {
    expect(check(build(call(REGISTRY, "create_chest", [addr(WALLET)], [addrCred(WALLET)]))).ok).toBe(true);
    expect(check(build(call(REGISTRY, "create_chest", [addr(WALLET)], []))).ok).toBe(false);
    expect(check(build(call(REGISTRY, "create_chest", [addr(OTHER)], [addrCred(WALLET)]))).ok).toBe(false);
  });
  it("allows claim and close_chest, rejects init and unknown functions", () => {
    expect(check(build(call(REGISTRY, "claim", []))).ok).toBe(true);
    expect(check(build(call(REGISTRY, "close_chest", []))).ok).toBe(true);
    for (const f of ["init", "set_admin", "upgrade"]) expect(check(build(call(REGISTRY, f, []))).ok).toBe(false);
  });
  it("rejects claim/close on any other contract", () => {
    expect(check(build(call(OTHER, "claim", []))).ok).toBe(false);
  });
  it("allows XLM transfer only from the authorizing wallet", () => {
    const args = (f: string) => [addr(f), addr(OTHER), nativeToScVal(BigInt(10), { type: "i128" })];
    expect(check(build(call(SAC, "transfer", args(WALLET), [addrCred(WALLET)]))).ok).toBe(true);
    expect(check(build(call(SAC, "transfer", args(OTHER), [addrCred(WALLET)]))).ok).toBe(false);
    expect(check(build(call(SAC, "approve", [addr(WALLET)], [addrCred(WALLET)]))).ok).toBe(false);
  });
  it("rejects source-account auth, multi-op, non-Soroban ops, fee-bump and the relayer as source", () => {
    expect(check(build(call(REGISTRY, "claim", [], [srcCred()]))).ok).toBe(false);
    const two = new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), { fee: "100", networkPassphrase: PASS })
      .addOperation(call(REGISTRY, "claim", [])).addOperation(call(REGISTRY, "claim", [])).setTimeout(30).build().toXDR();
    expect(check(two).ok).toBe(false);
    expect(check(build(Operation.payment({ destination: relayer, asset: Asset.native(), amount: "1" }))).ok).toBe(false);
    expect(check(build(call(REGISTRY, "claim", []), relayer)).ok).toBe(false);
    const inner = TransactionBuilder.fromXDR(build(call(REGISTRY, "claim", [])), PASS);
    const fb = TransactionBuilder.buildFeeBumpTransaction(Keypair.random(), "1000", inner as never, PASS);
    expect(check(fb.toXDR()).ok).toBe(false);
  });
  it("wallet deploy only with the Loot wallet wasm", () => {
    const dep = (hash: string) =>
      build(Operation.createCustomContract({ address: new Address(Keypair.random().publicKey()), wasmHash: Buffer.from(hash, "hex"), salt: Buffer.alloc(32, 1) }));
    const v = check(dep(WASM));
    expect(v.ok && v.kind).toBe("wallet_deploy");
    expect(check(dep("aa".repeat(32))).ok).toBe(false);
  });
  it("rejects garbage", () => expect(check("AAAA").ok).toBe(false));
});
