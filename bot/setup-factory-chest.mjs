#!/usr/bin/env node
/**
 * Crea un cofre en la FACTORY (un contrato por cofre) con el SDK `loot`.
 *   ANSWER='...' SALT=<decimal> QUESTION='...' PRIZES_XLM=10,10,10 DAYS=30 \
 *     node bot/setup-factory-chest.mjs
 * - La respuesta llega SOLO por env; se normaliza y solo se imprime la huella (nunca la respuesta).
 * - SALT: sal pública (decimal). Sin SALT se usa la derivada de la pregunta (como `createChest` del SDK).
 * - Creador: CREATOR_SECRET del entorno, o si no existe una identidad de prueba nueva que se fondea
 *   con Friendbot; su secreto se guarda en CREATOR_FILE (default /tmp/loot-factory-creator.env, fuera del repo).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Keypair } from "../packages/sdk/node_modules/@stellar/stellar-sdk/lib/esm/index.js";
import {
  createChestFromFingerprint,
  fingerprintAnswer,
  keypairSigner,
  saltFromQuestion,
  NETWORK,
} from "../packages/sdk/dist/index.js";

const ANSWER = process.env.ANSWER;
const QUESTION = process.env.QUESTION;
if (!ANSWER || !QUESTION) {
  console.error("Falta ANSWER o QUESTION");
  process.exit(2);
}
const prizes = (process.env.PRIZES_XLM || "10,10,10,10,10,10,10,10,10,10").split(",").map((s) => s.trim());
const days = Number(process.env.DAYS || 30);
const salt = process.env.SALT ? BigInt(process.env.SALT) : saltFromQuestion(QUESTION);

const file = process.env.CREATOR_FILE || "/tmp/loot-factory-creator.env";
let secret = process.env.CREATOR_SECRET;
if (!secret && existsSync(file)) secret = readFileSync(file, "utf8").match(/CREATOR_SECRET=(\S+)/)?.[1];
if (!secret) {
  const kp = Keypair.random();
  secret = kp.secret();
  writeFileSync(file, `CREATOR_SECRET=${secret}\n`, { mode: 0o600 });
  const r = await fetch(`${NETWORK.friendbotUrl}?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
const signer = keypairSigner(secret);
const { fingerprintHex } = await fingerprintAnswer(ANSWER, salt);
const out = await createChestFromFingerprint({
  question: QUESTION,
  fingerprintHex,
  prizesXlm: prizes,
  durationDays: days,
  signer,
});
console.log(JSON.stringify({ creator: signer.publicKey, salt: salt.toString(), ...out }, null, 2));
