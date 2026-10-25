import { hash } from "@stellar/stellar-sdk";

/** Codifica la respuesta (texto o número) a field element BN254. */
export function answerToField(answer: string): bigint {
  const trimmed = answer.trim();
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  const digest = hash(Buffer.from(trimmed, "utf8"));
  const arr = Buffer.from(digest);
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex"));
}

export function randomSalt(): bigint {
  const rnd = crypto.getRandomValues(new Uint8Array(31));
  return BigInt(
    "0x" + [...rnd].map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}
