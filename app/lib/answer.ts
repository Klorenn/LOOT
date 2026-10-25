import { hash } from "@stellar/stellar-sdk";

/**
 * Normaliza la respuesta antes de hashear: trim, minúsculas, sin acentos ni espacios.
 * Misma regla al crear el cofre y al resolverlo (si no, "Lisboa" y "lisboa" darían huellas distintas).
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "");
}

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

/**
 * Sal derivada de la pregunta (cofres creados por SDK/scripts, sin metadatos): sha256(utf8 pregunta)
 * con byte[0]=0. Igual que `saltFromQuestion` del SDK. Decimal.
 */
export function saltFromQuestion(question: string): string {
  const arr = Buffer.from(hash(Buffer.from(question, "utf8")));
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex")).toString();
}
