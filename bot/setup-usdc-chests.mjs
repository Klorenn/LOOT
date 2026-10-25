#!/usr/bin/env node
/**
 * Crea los cofres de premio USDC (ZK #3 + normal #1) con la cuenta CREATOR.
 *   node --env-file app/.env.local bot/setup-usdc-chests.mjs [zk|normal]
 * Orden: trustline USDC del creator -> chequeo de saldo -> create_chest.
 * Si falta saldo imprime cuánto y sale con código 3 (faucet: https://faucet.circle.com).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { submit } from "../app/lib/normal-chest.ts";
import { CONTRACTS, DEMO_CHEST, NETWORK, NORMAL_CHEST, USDC, usdcToStroops } from "../app/lib/config.ts";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../app/package.json"));
const sdk = require("@stellar/stellar-sdk");
const { Address, Asset, Contract, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, hash } = sdk;

const which = process.argv[2];
const doZk = !which || which === "zk";
const doNormal = !which || which === "normal";
const secret = process.env.CREATOR_SECRET || process.env.RELAYER_SECRET;
if (!secret) {
  console.error("Falta CREATOR_SECRET (usá --env-file app/.env.local)");
  process.exit(2);
}

const kp = Keypair.fromSecret(secret);
const server = new rpc.Server(NETWORK.rpcUrl);
const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

const needed =
  (doZk ? DEMO_CHEST.slots * USDC.prize : 0) + (doNormal ? NORMAL_CHEST.slots * USDC.prize : 0);

async function usdcBalance() {
  const r = await fetch(`${NETWORK.horizonUrl}/accounts/${kp.publicKey()}`);
  if (!r.ok) throw new Error(`Horizon ${r.status} para ${kp.publicKey()}`);
  const acc = await r.json();
  const b = acc.balances.find((x) => x.asset_code === USDC.code && x.asset_issuer === USDC.issuer);
  return b ? Number(b.balance) : null;
}

let bal = await usdcBalance();
if (bal === null) {
  console.log("creator sin trustline USDC → creándola");
  await submit(
    server,
    kp,
    (acc) =>
      new TransactionBuilder(acc, { fee: "10000", networkPassphrase: NETWORK.passphrase })
        .addOperation(Operation.changeTrust({ asset: new Asset(USDC.code, USDC.issuer) }))
        .setTimeout(60)
        .build(),
    [],
    false,
  );
  bal = await usdcBalance();
}
console.log(`deployer ${kp.publicKey()} · USDC ${bal} · necesita ${needed}`);
if (bal < needed) {
  console.error(`FALTA USDC: faltan ${(needed - bal).toFixed(2)}. Faucet Circle (Stellar Testnet) → ${kp.publicKey()}`);
  process.exit(3);
}

function create(contractId, method, args) {
  return submit(server, kp, (acc) =>
    new TransactionBuilder(acc, { fee: "10000000", networkPassphrase: NETWORK.passphrase })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(120)
      .build(),
  );
}

async function idFrom(txHash) {
  const res = await server.getTransaction(txHash);
  return Number(scValToNative(res.returnValue));
}

const me = Address.fromString(kp.publicKey()).toScVal();
const prize = nativeToScVal(usdcToStroops(USDC.prize), { type: "i128" });

if (doZk) {
  const h = await create(CONTRACTS.chest, "create_chest", [
    me,
    nativeToScVal(Buffer.from(DEMO_CHEST.fingerprintHex, "hex"), { type: "bytes" }),
    Address.fromString(CONTRACTS.token).toScVal(),
    prize,
    nativeToScVal(DEMO_CHEST.slots, { type: "u32" }),
    nativeToScVal(0, { type: "u64" }),
  ]);
  const id = await idFrom(h);
  console.log(`ZK chest #${id} · ${EXPLORER}${h}`);
  if (id !== DEMO_CHEST.id) console.warn(`!! pegá id=${id} en DEMO_CHEST.id (config.ts) y en NOTES/README`);
}

if (doNormal) {
  const answerHash = hash(Buffer.from("8", "utf8"));
  const h = await create(NORMAL_CHEST.contract, "create_chest", [
    me,
    prize,
    nativeToScVal(NORMAL_CHEST.slots, { type: "u32" }),
    nativeToScVal(answerHash, { type: "bytes" }),
  ]);
  const id = await idFrom(h);
  console.log(`Normal chest #${id} · ${EXPLORER}${h}`);
  if (id !== NORMAL_CHEST.id) console.warn(`!! pegá id=${id} en NORMAL_CHEST.id (config.ts)`);
}
