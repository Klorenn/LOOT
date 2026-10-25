import { hash } from "@stellar/stellar-sdk";
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
  const digest = hash(Buffer.from(trimmed, "utf8"));
  const arr = Buffer.from(digest);
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
 * Fingerprint = Poseidon(answerField, salt).
 * Normalizes the answer first (trim, lower, no accents/spaces).
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
