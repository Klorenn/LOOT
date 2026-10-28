import { argon2id } from "hash-wasm";
import { answerToField } from "./answer";

/**
 * How a chest turns its (normalized) answer into the circuit's private `answer_field`.
 * The circuit, zkey and verifier are unchanged: they only check Poseidon(answer_field, salt) == fingerprint,
 * and answer_field is computed here, outside the circuit (see docs/KDF-PROPOSAL.md).
 *
 * - "v1" (also when absent): answerToField(normalized): one SHA-256 (numbers taken as-is). Every chest made
 *   before the KDF, and every mainnet chest.
 * - "argon2id-v1": argon2id over the normalized answer, salted with the chest salt. New testnet registry v2
 *   chests only. One guess now costs a 19 MiB argon2id run instead of a SHA-256.
 *
 * The version is stored in the chest metadata (`kdf`), so old chests keep the old derivation forever.
 */
export type Kdf = "v1" | "argon2id-v1";
export const KDF_ARGON2ID_V1 = "argon2id-v1" as const;

/**
 * Pinned parameters of "argon2id-v1". NEVER change them: every chest made with this tag depends on them.
 * A different profile needs a new tag. Values: the OWASP argon2id profile (m = 19 MiB, t = 2, p = 1), chosen to
 * stay usable on phones (single thread: no SharedArrayBuffer / cross-origin isolation needed).
 */
export const ARGON2ID_V1 = { memoryKiB: 19 * 1024, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export class UnknownKdfError extends Error {
  constructor(kdf: string) {
    super(`This chest uses an answer format ("${kdf}") this version of Loot does not know. Update the app and retry.`);
    this.name = "UnknownKdfError";
  }
}

/** Metadata value -> Kdf. Absent = v1; anything unknown throws (never hash with the wrong scheme). */
export function parseKdf(v: unknown): Kdf {
  if (v === undefined || v === null || v === "v1") return "v1";
  if (v === KDF_ARGON2ID_V1) return KDF_ARGON2ID_V1;
  throw new UnknownKdfError(String(v));
}

/** Chest salt (decimal field element, < 2^248) as 31 big-endian bytes: the argon2id salt. */
export function saltBytes(salt: bigint): Uint8Array {
  if (salt < BigInt(0) || salt >= BigInt(1) << BigInt(248)) throw new Error("salt out of range");
  const hex = salt.toString(16).padStart(62, "0");
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
}

/** argon2id-v1: 32-byte argon2id output with the top byte zeroed (248 bits, below the BN254 modulus). */
export async function argon2idAnswerField(normalized: string, salt: bigint): Promise<bigint> {
  if (!normalized) throw new Error("empty answer");
  const out = await argon2id({
    password: new TextEncoder().encode(normalized),
    salt: saltBytes(salt),
    parallelism: ARGON2ID_V1.parallelism,
    iterations: ARGON2ID_V1.iterations,
    memorySize: ARGON2ID_V1.memoryKiB,
    hashLength: ARGON2ID_V1.hashLength,
    outputType: "binary",
  });
  const b = Uint8Array.from(out);
  b[0] = 0;
  return BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
}

/** answer_field for a NORMALIZED answer under `kdf`. Create and solve both call this. */
export async function deriveAnswerField(normalized: string, salt: bigint, kdf: Kdf): Promise<bigint> {
  if (kdf === "v1") return answerToField(normalized);
  if (kdf === KDF_ARGON2ID_V1) return argon2idAnswerField(normalized, salt);
  throw new UnknownKdfError(String(kdf));
}
