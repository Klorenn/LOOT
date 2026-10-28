import { describe, expect, it } from "vitest";
import { argon2id as nobleArgon2id } from "@noble/hashes/argon2.js";
import { answerToField, normalizeAnswer } from "./answer";
import { ARGON2ID_V1, UnknownKdfError, deriveAnswerField, parseKdf, saltBytes } from "./kdf";

const BN254_R = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

/** Independent implementation (noble) of the same pinned derivation, to catch drift in either library. */
function reference(normalized: string, salt: bigint): bigint {
  const out = nobleArgon2id(new TextEncoder().encode(normalized), saltBytes(salt), {
    t: ARGON2ID_V1.iterations,
    m: ARGON2ID_V1.memoryKiB,
    p: ARGON2ID_V1.parallelism,
    dkLen: ARGON2ID_V1.hashLength,
  });
  out[0] = 0;
  return BigInt("0x" + Buffer.from(out).toString("hex"));
}

describe("kdf argon2id-v1 (answer_field for new testnet v2 chests)", () => {
  it("pinned parameters never change", () => {
    expect(ARGON2ID_V1).toEqual({ memoryKiB: 19456, iterations: 2, parallelism: 1, hashLength: 32 });
  });

  it("pinned vector", async () => {
    expect((await deriveAnswerField("thethirddoorontheleft", BigInt(123456789), "argon2id-v1")).toString()).toBe(
      "47712982417066414512386738614615183116212138226099077485885352066141081121",
    );
  });

  it.each([
    ["thethirddoorontheleft", BigInt(123456789)],
    [normalizeAnswer("  Ñandú 42 "), (BigInt(1) << BigInt(247)) + BigInt(5)],
    ["8", BigInt(7)],
  ])("matches an independent argon2id implementation (%s)", async (n, salt) => {
    const v = await deriveAnswerField(n, salt, "argon2id-v1");
    expect(v).toBe(reference(n, salt));
    expect(v < BN254_R).toBe(true);
  });

  it("depends on the salt (no cross-chest tables)", async () => {
    const a = await deriveAnswerField("same answer", BigInt(1), "argon2id-v1");
    const b = await deriveAnswerField("same answer", BigInt(2), "argon2id-v1");
    expect(a).not.toBe(b);
  });

  it("v1 (and absent) keeps the old derivation for old chests", async () => {
    expect(await deriveAnswerField("lisboa", BigInt(7), "v1")).toBe(answerToField("lisboa"));
    expect(await deriveAnswerField("8", BigInt(7), parseKdf(undefined))).toBe(BigInt(8));
  });

  it("unknown kdf tags are refused, never hashed with the wrong scheme", () => {
    expect(() => parseKdf("argon2id-v9")).toThrow(UnknownKdfError);
    expect(parseKdf("argon2id-v1")).toBe("argon2id-v1");
    expect(parseKdf(null)).toBe("v1");
  });

  it("salt encoding is 31 big-endian bytes", () => {
    expect(Buffer.from(saltBytes(BigInt(258))).toString("hex")).toBe("00".repeat(29) + "0102");
    expect(() => saltBytes(BigInt(1) << BigInt(248))).toThrow();
  });
});
