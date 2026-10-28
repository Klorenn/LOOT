import { Address, StrKey, xdr } from "@stellar/stellar-sdk";
import type { rpc } from "@stellar/stellar-sdk";
import { WALLET_WASM_HASH } from "./network";

/**
 * Registry v2 `claim` calls `recipient.require_auth()`. For a C-address recipient that runs the recipient
 * contract's `__check_auth` INSIDE the relayer-paid transaction, so an attacker-written contract could burn the
 * relayer's fee budget. The relayer therefore sponsors claims only to:
 *  - G accounts (ed25519 signature check by the host), or
 *  - C contracts running the canonical passkey-kit wallet wasm (lib/network.ts WALLET_WASM_HASH).
 * Anyone else can still claim by submitting the transaction themselves (and paying for it).
 */
export const RECIPIENT_NOT_SUPPORTED = {
  error: "This account type can't be sponsored. Claim with a Stellar wallet (G… address) or a Loot passkey wallet.",
  code: "recipient_not_supported",
} as const;

/** Pure decision. `wasmHashHex` = the recipient contract's wasm hash, or null when unknown / not a wasm contract. */
export function sponsorableRecipient(recipient: string, wasmHashHex: string | null, allowed = WALLET_WASM_HASH): boolean {
  if (StrKey.isValidEd25519PublicKey(recipient)) return true;
  if (!StrKey.isValidContract(recipient)) return false;
  return wasmHashHex !== null && wasmHashHex.toLowerCase() === allowed.toLowerCase();
}

/** Wasm hash (hex) of contract `contractId`'s live instance, or null (missing, archived, or not a wasm contract). */
export async function contractWasmHash(server: Pick<rpc.Server, "getLedgerEntries">, contractId: string): Promise<string | null> {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  const r = await server.getLedgerEntries(key);
  const exe = r.entries[0]?.val.contractData().val().instance().executable();
  if (!exe || exe.switch().name !== "contractExecutableWasm") return null;
  return Buffer.from(exe.wasmHash()).toString("hex");
}
