import { describe, expect, it } from "vitest";
import { Address, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { contractWasmHash, sponsorableRecipient } from "./claim-recipient";
import { WALLET_WASM_HASH } from "./network";

const C = StrKey.encodeContract(Buffer.alloc(32, 5));

function fakeServer(exe: xdr.ContractExecutable | null) {
  return {
    async getLedgerEntries() {
      if (!exe) return { entries: [], latestLedger: 1 } as never;
      const val = xdr.LedgerEntryData.contractData(
        new xdr.ContractDataEntry({
          ext: new xdr.ExtensionPoint(0),
          contract: Address.fromString(C).toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: exe, storage: null })),
        }),
      );
      return { entries: [{ val }], latestLedger: 1 } as never;
    },
  };
}

describe("sponsorable claim recipients (registry v2)", () => {
  it("G accounts are always fine", () => {
    expect(sponsorableRecipient(Keypair.random().publicKey(), null)).toBe(true);
  });
  it("C contracts only with the passkey wallet wasm", () => {
    expect(sponsorableRecipient(C, WALLET_WASM_HASH)).toBe(true);
    expect(sponsorableRecipient(C, "11".repeat(32))).toBe(false);
    expect(sponsorableRecipient(C, null)).toBe(false);
    expect(sponsorableRecipient("not-an-address", WALLET_WASM_HASH)).toBe(false);
  });
  it("reads the wasm hash of a contract instance", async () => {
    const exe = xdr.ContractExecutable.contractExecutableWasm(Buffer.from(WALLET_WASM_HASH, "hex"));
    expect(await contractWasmHash(fakeServer(exe), C)).toBe(WALLET_WASM_HASH);
    expect(await contractWasmHash(fakeServer(xdr.ContractExecutable.contractExecutableStellarAsset()), C)).toBeNull();
    expect(await contractWasmHash(fakeServer(null), C)).toBeNull();
  });
});
