import { Address, hash } from "@stellar/stellar-sdk";
import { buildPoseidon } from "circomlibjs";
import { normalizeAnswer } from "./normalize.js";

let poseidonPromise: Promise<Awaited<ReturnType<typeof buildPoseidon>>> | null =
  null;

async function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

/** Encode answer text/number to BN254 field element (same as the app). */
export function answerToField(answer: string): bigint {
  const trimmed = answer.trim();
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  const arr = Buffer.from(hash(Buffer.from(trimmed, "utf8")));
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex"));
}

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const p = await poseidon();
  return p.F.toObject(p([a, b])) as bigint;
}

export function fieldToHex(fe: bigint | string): string {
  return BigInt(fe).toString(16).padStart(64, "0");
}

/**
 * Field element of a Stellar address (G… or C…):
 * sha256(xdr(ScVal Address)) with byte[0]=0. Matches `field_from_address` in the
 * contracts. Used for both the `recipient` and the `chestId` public inputs
 * (for a per-chest contract, chestId = field of the chest contract address).
 */
export function addressField(address: string): { hex: string; decimal: string } {
  const bytes = new Address(address).toScVal().toXDR();
  const arr = Buffer.from(hash(bytes));
  arr[0] = 0;
  const hex = arr.toString("hex");
  return { hex, decimal: BigInt("0x" + hex).toString() };
}

/**
 * Salt of a factory chest. The factory's create_chest has no salt parameter, so the
 * salt is derived from the (public, on-chain) question: sha256(utf8) with byte[0]=0.
 * Legacy registry chests used a random salt kept off-chain; pass it explicitly there.
 */
export function saltFromQuestion(question: string): bigint {
  const arr = Buffer.from(hash(Buffer.from(question, "utf8")));
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex"));
}

/**
 * Fingerprint = Poseidon(answerField, salt).
 * Normalizes the answer first (trim, lower, strip accents and spaces).
 */
export async function fingerprintAnswer(
  answer: string,
  salt: bigint | string,
): Promise<{ fingerprintHex: string; normalized: string }> {
  const normalized = normalizeAnswer(answer);
  const fe = answerToField(normalized);
  const fp = await poseidon2(fe, BigInt(salt));
  return { fingerprintHex: fieldToHex(fp), normalized };
}
