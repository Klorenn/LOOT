import { describe, expect, it } from "vitest";
import { Account, Address, Asset, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { checkRelayable, type RelayPolicy } from "./relay-policy";
import { refOf } from "./registry";

const PASS = Networks.PUBLIC;
const cid = (n: number) => StrKey.encodeContract(Buffer.alloc(32, n));
const REG1 = cid(1);
const REG2 = cid(2);
const SAC = Asset.native().contractId(PASS);
const OTHER = cid(9);
const WALLET = cid(7);
const WASM = "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";
const relayer = Keypair.random().publicKey();
const NOW = 1_800_000_000;
const XLM = (n: number) => BigInt(Math.round(n * 1e7));

const seen: number[] = [];
const base: RelayPolicy = {
  registry: REG1,
  registryV2: REG2,
  xlmSac: SAC,
  walletWasmHashHex: WASM,
  relayerPublicKey: relayer,
  chestInfo: async (ref) => {
    seen.push(ref);
    return ref === refOf(2, 3) ? { token: SAC, creator: WALLET } : null;
  },
};
const mainnet: RelayPolicy = {
  ...base,
  allow: { ids: [], creators: [WALLET] },
  createLimits: { maxPrizeStroops: XLM(1), maxTotalStroops: XLM(30), maxDeadlineSecs: 30 * 86400, nowSec: NOW },
};

const root = (contract: string) =>
  new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: new Address(contract).toScAddress(), functionName: "x", args: [] }),
    ),
    subInvocations: [],
  });
const addrCred = (addr: string, contract: string) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(addr).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: 100,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: root(contract),
  });
const build = (op: xdr.Operation) =>
  new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), { fee: "100", networkPassphrase: PASS }).addOperation(op).setTimeout(30).build().toXDR();
const call = (contract: string, fn: string, args: xdr.ScVal[], auth?: xdr.SorobanAuthorizationEntry[]) =>
  Operation.invokeContractFunction({ contract, function: fn, args, auth });
const addr = (a: string) => new Address(a).toScVal();
const u64 = (n: number) => nativeToScVal(BigInt(n), { type: "u64" });
const chestArgs = (o: { token?: string; prize?: bigint; claims?: number; deadline?: number } = {}) => [
  nativeToScVal(Buffer.alloc(32, 1)),
  addr(o.token ?? SAC),
  nativeToScVal(o.prize ?? XLM(1), { type: "i128" }),
  nativeToScVal(o.claims ?? 1, { type: "u32" }),
  u64(o.deadline ?? NOW + 86400),
];
const auth = (contract: string) => [addrCred(WALLET, contract)];

describe("relay policy: registry v2", () => {
  it("create_set by an authorizing creator is relayed", async () => {
    const r = await checkRelayable(build(call(REG2, "create_set", [addr(WALLET)], auth(REG2))), PASS, base);
    expect(r.ok).toBe(true);
  });
  it("create_set needs the creator's authorization and an approved creator on mainnet", async () => {
    const noAuth = await checkRelayable(build(call(REG2, "create_set", [addr(WALLET)], [addrCred(OTHER, REG2)])), PASS, base);
    expect(noAuth.ok).toBe(false);
    const other = await checkRelayable(build(call(REG2, "create_set", [addr(OTHER)], [addrCred(OTHER, REG2)])), PASS, mainnet);
    expect(other.ok).toBe(false);
    const approved = await checkRelayable(build(call(REG2, "create_set", [addr(WALLET)], auth(REG2))), PASS, mainnet);
    expect(approved.ok).toBe(true);
  });
  it("create_set and create_chest_in_set exist only on v2: refused on v1 or when v2 is not configured", async () => {
    const onV1 = await checkRelayable(build(call(REG1, "create_set", [addr(WALLET)], auth(REG1))), PASS, base);
    expect(onV1.ok).toBe(false);
    const noV2 = await checkRelayable(build(call(REG2, "create_set", [addr(WALLET)], auth(REG2))), PASS, { ...base, registryV2: undefined });
    expect(noV2.ok).toBe(false);
  });
  it("create_chest_in_set is relayed with the same token and mainnet caps as create_chest", async () => {
    const args = (o?: Parameters<typeof chestArgs>[0]) => [addr(WALLET), u64(4), ...chestArgs(o)];
    const ok = await checkRelayable(build(call(REG2, "create_chest_in_set", args(), auth(REG2))), PASS, mainnet);
    expect(ok.ok).toBe(true);
    const wrongToken = await checkRelayable(build(call(REG2, "create_chest_in_set", args({ token: OTHER }), auth(REG2))), PASS, base);
    expect(wrongToken.ok).toBe(false);
    const bigPrize = await checkRelayable(build(call(REG2, "create_chest_in_set", args({ prize: XLM(5) }), auth(REG2))), PASS, mainnet);
    expect(bigPrize.ok).toBe(false);
    const farDeadline = await checkRelayable(build(call(REG2, "create_chest_in_set", args({ deadline: NOW + 40 * 86400 }), auth(REG2))), PASS, mainnet);
    expect(farDeadline.ok).toBe(false);
    const wrongArity = await checkRelayable(build(call(REG2, "create_chest_in_set", [addr(WALLET), ...chestArgs()], auth(REG2))), PASS, base);
    expect(wrongArity.ok).toBe(false);
  });
  it("create_chest on v2 uses the same checks (6 arguments)", async () => {
    const ok = await checkRelayable(build(call(REG2, "create_chest", [addr(WALLET), ...chestArgs()], auth(REG2))), PASS, base);
    expect(ok.ok).toBe(true);
  });
  it("claim/close on v2 look the chest up by ref, not by its bare id", async () => {
    seen.length = 0;
    const ok = await checkRelayable(build(call(REG2, "claim", [u64(3)])), PASS, base);
    expect(ok.ok).toBe(true);
    expect(seen).toEqual([refOf(2, 3)]);
    // the same bare id on v1 is a different chest (and unknown here)
    const v1 = await checkRelayable(build(call(REG1, "claim", [u64(3)])), PASS, base);
    expect(v1.ok).toBe(false);
    expect(seen).toEqual([refOf(2, 3), 3]);
  });
});
