/**
 * Answer KDF tags (no crypto here, so the server routes and the mainnet create bundle never pull hash-wasm).
 * The derivation itself lives in ./kdf.ts. See docs/KDF-PROPOSAL.md.
 *
 * - "v1" (also when absent): one SHA-256 of the normalized answer. Every older chest and every mainnet chest.
 * - "argon2id-v1": argon2id over the normalized answer, salted with the chest salt. New testnet registry v2 chests.
 */
export type Kdf = "v1" | "argon2id-v1";
export const KDF_ARGON2ID_V1 = "argon2id-v1" as const;

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
