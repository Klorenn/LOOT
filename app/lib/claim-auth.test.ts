import { describe, expect, it } from "vitest";
import { Address, Keypair, Networks, StrKey, xdr } from "@stellar/stellar-sdk";
import { checkClaimAuthEntry, claimArgsToScVals, signClaimAuthEntry, type ClaimArgs } from "@findloot/chest";

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 10));
const player = Keypair.random();

const args = (over: Partial<ClaimArgs> = {}): ClaimArgs => ({
  chestId: BigInt(7),
  recipient: player.publicKey(),
  nullifier: Buffer.alloc(32, 1),
  proof: { a: Buffer.alloc(64, 2), b: Buffer.alloc(128, 3), c: Buffer.alloc(64, 4) },
  ...over,
});

/** The unsigned entry a recording-mode simulation would return for `claim`. */
function unsigned(a: ClaimArgs, contract = CONTRACT, subs: xdr.SorobanAuthorizedInvocation[] = []) {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(contract).toScAddress(),
        functionName: "claim",
        args: claimArgsToScVals(a),
      }),
    ),
    subInvocations: subs,
  });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(a.recipient).toScAddress(),
        nonce: xdr.Int64.fromString("12345"),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: invocation,
  }).toXDR("base64");
}

const sign = (entry: string, kp = player) => signClaimAuthEntry(entry, kp, 1000, Networks.TESTNET);

describe("claim auth entry (registry v2: recipient signs, relayer pays)", () => {
  it("accepts the recipient's signature over exactly this claim", async () => {
    const signed = await sign(unsigned(args()));
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args(), currentLedger: 900 })).not.toThrow();
  });

  it("rejects an unsigned entry", () => {
    expect(() => checkClaimAuthEntry(unsigned(args()), { contractId: CONTRACT, args: args() })).toThrow(/not signed/);
  });

  it("rejects an expired signature", async () => {
    const signed = await sign(unsigned(args()));
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args(), currentLedger: 1000 })).toThrow(
      /expired/,
    );
  });

  it("rejects a signature for different claim arguments (other nullifier, chest or recipient)", async () => {
    const signed = await sign(unsigned(args()));
    expect(() =>
      checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args({ nullifier: Buffer.alloc(32, 5) }) }),
    ).toThrow(/arguments differ/);
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args({ chestId: BigInt(8) }) })).toThrow(
      /arguments differ/,
    );
    const other = Keypair.random().publicKey();
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args({ recipient: other }) })).toThrow(
      /recipient/,
    );
  });

  it("rejects an entry for another contract", async () => {
    const signed = await sign(unsigned(args(), OTHER_CONTRACT));
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args() })).toThrow(/another contract/);
  });

  it("rejects an entry that also authorizes sub-invocations", async () => {
    const sub = xdr.SorobanAuthorizationEntry.fromXDR(unsigned(args()), "base64").rootInvocation();
    const signed = await sign(unsigned(args(), CONTRACT, [sub]));
    expect(() => checkClaimAuthEntry(signed, { contractId: CONTRACT, args: args() })).toThrow(/sub-invocations/);
  });

  it("a wallet callback that returns someone else's signature is refused when signing", async () => {
    const thief = Keypair.random();
    await expect(
      signClaimAuthEntry(unsigned(args()), async (_pre, payload) => thief.sign(payload), 1000, Networks.TESTNET),
    ).rejects.toThrow();
  });

  it("rejects garbage", () => {
    expect(() => checkClaimAuthEntry("AAAA", { contractId: CONTRACT, args: args() })).toThrow();
  });
});
