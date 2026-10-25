#!/usr/bin/env node
/**
 * Crea los cofres de premio en XLM nativo (SAC) con la cuenta CREATOR.
 *   node --env-file app/.env.local bot/setup-xlm-chests.mjs [zk|normal]
 *  zk     -> create_chest en el contrato principal (CONTRACTS.chest).
 *            La respuesta llega SOLO por env (ANSWER=... SLOTS=10); se normaliza como la app
 *            Opcionales: SALT (sal fija; default aleatoria) y PRIZE_STROOPS (default 10 XLM por cupo).
 *            Se normaliza (trim, minúsculas, sin acentos) y solo se imprime la huella y la sal, nunca la respuesta.
 *  normal -> despliega una instancia nueva de normal-chest con token = XLM SAC,
 *            la inicializa y crea el cofre (el token se fija en init).
 * Imprime ids y hashes; nunca imprime secretos.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { submit } from "../app/lib/normal-chest.ts";
import { CONTRACTS, NETWORK, NORMAL_CHEST, XLM_SAC, PRIZE } from "../app/lib/config.ts";
import { answerToField, normalizeAnswer, randomSalt } from "../app/lib/answer.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "app/package.json"));
const { Address, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, hash } =
  require("@stellar/stellar-sdk");
const { buildPoseidon } = require("circomlibjs");

const which = process.argv[2];
const doZk = !which || which === "zk";
const doNormal = !which || which === "normal";
const NORMAL_SLOTS = Number(process.env.NORMAL_SLOTS || 30);
const secret = process.env.CREATOR_SECRET;
if (!secret) {
  console.error("Falta CREATOR_SECRET (usá --env-file app/.env.local)");
  process.exit(2);
}

const kp = Keypair.fromSecret(secret);
const server = new rpc.Server(NETWORK.rpcUrl);
const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";
const me = Address.fromString(kp.publicKey()).toScVal();
const prize = nativeToScVal(BigInt(process.env.PRIZE_STROOPS || PRIZE.perSlotStroops), { type: "i128" });
console.log(`creator ${kp.publicKey()}`);

function invoke(contractId, method, args) {
  return submit(server, kp, (acc) =>
    new TransactionBuilder(acc, { fee: "10000000", networkPassphrase: NETWORK.passphrase })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(120)
      .build(),
  );
}
const idFrom = async (h) => Number(scValToNative((await server.getTransaction(h)).returnValue));

if (doZk) {
  const answer = process.env.ANSWER;
  if (!answer) {
    console.error("Falta ANSWER en el entorno (no se guarda en ningún archivo)");
    process.exit(2);
  }
  const slots = Number(process.env.SLOTS || 10);
  const salt = process.env.SALT ? BigInt(process.env.SALT) : randomSalt();
  const poseidon = await buildPoseidon();
  const fp = poseidon.F.toObject(poseidon([answerToField(normalizeAnswer(answer)), salt]));
  const fingerprintHex = BigInt(fp).toString(16).padStart(64, "0");
  const h = await invoke(CONTRACTS.chest, "create_chest", [
    me,
    nativeToScVal(Buffer.from(fingerprintHex, "hex"), { type: "bytes" }),
    Address.fromString(XLM_SAC).toScVal(),
    prize,
    nativeToScVal(slots, { type: "u32" }),
    nativeToScVal(0, { type: "u64" }),
  ]);
  console.log(`ZK chest #${await idFrom(h)} slots=${slots} · ${EXPLORER}${h}`);
  console.log(`salt=${salt.toString()}`);
  console.log(`fingerprintHex=${fingerprintHex}`);
}

if (doNormal) {
  const env = { ...process.env, STELLAR_ACCOUNT: secret };
  const wasm = join(ROOT, "contracts/normal-chest/target/wasm32v1-none/release/chestzk_normal_chest.wasm");
  const contractId = execFileSync(
    "stellar",
    ["contract", "deploy", "--wasm", wasm, "--network", "testnet"],
    { env, encoding: "utf8" },
  ).trim().split("\n").pop();
  console.log(`normal-chest contract ${contractId}`);
  const hi = await invoke(contractId, "init", [me, Address.fromString(XLM_SAC).toScVal()]);
  console.log(`init · ${EXPLORER}${hi}`);
  const h = await invoke(contractId, "create_chest", [
    me,
    prize,
    nativeToScVal(NORMAL_SLOTS, { type: "u32" }),
    nativeToScVal(hash(Buffer.from(NORMAL_CHEST.answer, "utf8")), { type: "bytes" }),
  ]);
  console.log(`Normal chest #${await idFrom(h)} slots=${NORMAL_SLOTS} · ${EXPLORER}${h}`);
}
