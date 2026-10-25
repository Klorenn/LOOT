import { Address, hash } from "@stellar/stellar-sdk";

/**
 * Debe coincidir con `ChestZk::field_from_address` en el contrato:
 * sha256(xdr(ScVal::Address)) con byte[0] = 0 (248 bits < r de BN254).
 */
export function recipientField(accountId: string): { hex: string; decimal: string } {
  const addr = Address.fromString(accountId);
  const bytes = addr.toScVal().toXDR();
  const digest = hash(bytes);
  const arr = Buffer.from(digest);
  arr[0] = 0;
  const hex = arr.toString("hex");
  const decimal = BigInt("0x" + hex).toString();
  return { hex, decimal };
}
