#!/usr/bin/env node
/**
 * Bot atacante de demo: toma una prueba válida atada a `victim` y la reenvía
 * cambiando el receptor a la cuenta del bot. En ChestZK la verificación falla.
 *
 * Uso:
 *   node bot/attack.mjs --proof /tmp/claim-args.json --victim G... --bot G...
 *
 * O genera una prueba fresca y ataca en el mismo run:
 *   node bot/attack.mjs --live
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEST = "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";
const STELLAR = process.env.STELLAR || "/opt/homebrew/bin/stellar";

function log(msg) {
  const line = `[bot ${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  return line;
}

function parseArgs(argv) {
  const out = { live: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--live") out.live = true;
    else if (argv[i] === "--proof") out.proof = argv[++i];
    else if (argv[i] === "--victim") out.victim = argv[++i];
    else if (argv[i] === "--bot") out.bot = argv[++i];
  }
  return out;
}

function invokeClaim(recipient, nullifier, proof) {
  const args = [
    "contract",
    "invoke",
    "--id",
    CHEST,
    "--source",
    "deployer",
    "--network",
    "testnet",
    "--inclusion-fee",
    "100000",
    "--instructions",
    "100000000",
    "--",
    "claim",
    "--chest_id",
    "1",
    "--recipient",
    recipient,
    "--nullifier",
    nullifier,
    "--proof",
    JSON.stringify(proof),
  ];
  const r = spawnSync(STELLAR, args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

async function generateVictimProof() {
  const { createRequire } = await import("node:module");
  const require = createRequire(join(ROOT, "app/package.json"));
  const { buildPoseidon } = require("circomlibjs");
  const snarkjs = require("snarkjs");
  const { Address, hash, Keypair } = require("@stellar/stellar-sdk");

  function recipientField(accountId) {
    const digest = hash(Address.fromString(accountId).toScVal().toXDR());
    const arr = Buffer.from(digest);
    arr[0] = 0;
    return BigInt("0x" + arr.toString("hex")).toString();
  }
  function feHex(s) {
    return BigInt(s).toString(16).padStart(64, "0");
  }

  const victim = Keypair.random();
  // Para el demo on-chain usamos el creator (ya tiene trustline)
  const recipient = "GAKD2FSFFNLBVTUB4JHFYVUUMTKKEEJO2TG77BHV2KCZTDPUB64JU7E2";
  const playerSecret = String(Date.now()) + "999";
  const wasm = join(ROOT, "app/public/zk/chest.wasm");
  const zkey = join(ROOT, "app/public/zk/chest_final.zkey");

  log(`generando prueba para víctima ${recipient.slice(0, 8)}…`);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      answer: "42",
      salt: "7",
      playerSecret,
      chestId: "1",
      recipient: recipientField(recipient),
    },
    wasm,
    zkey,
  );

  return {
    victim: recipient,
    nullifier: feHex(publicSignals[1]),
    proof: {
      a: feHex(proof.pi_a[0]) + feHex(proof.pi_a[1]),
      b:
        feHex(proof.pi_b[0][1]) +
        feHex(proof.pi_b[0][0]) +
        feHex(proof.pi_b[1][1]) +
        feHex(proof.pi_b[1][0]),
      c: feHex(proof.pi_c[0]) + feHex(proof.pi_c[1]),
    },
    _unusedVictimKp: victim.publicKey(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  let payload;

  if (args.live) {
    payload = await generateVictimProof();
  } else if (args.proof && existsSync(args.proof)) {
    payload = JSON.parse(readFileSync(args.proof, "utf8"));
    payload.victim = args.victim || payload.recipient || payload.victim;
  } else {
    console.error("Usá --live o --proof <json> [--victim G…] [--bot G…]");
    process.exit(2);
  }

  const bot =
    args.bot ||
    "GAVLW5IKB7VFBRJ3EHBE4BRZ5OX3AOW3ICMLMB6KVKCQDO6WJ2SPHDN3"; // deployer = bot

  log(`víctima: ${payload.victim}`);
  log(`bot:     ${bot}`);
  log("copiando prueba y cambiando receptor…");

  const r = invokeClaim(bot, payload.nullifier, payload.proof);
  const out = (r.stdout + "\n" + r.stderr).trim();
  writeFileSync(
    join(ROOT, "bot/last-attack.json"),
    JSON.stringify({ bot, victim: payload.victim, result: out, status: r.status }, null, 2),
  );

  if (/InvalidProof|Error\(Contract,\s*#6\)|error/i.test(out) && r.status !== 0) {
    log("RECHAZADO — la prueba no es para esta cuenta");
    process.exit(0);
  }
  if (/InvalidProof|Error\(Contract,\s*#6\)/i.test(out)) {
    log("RECHAZADO — la prueba no es para esta cuenta");
    process.exit(0);
  }
  // stellar a veces sale 0 con error en stdout
  if (/InvalidProof|#6|HostError/i.test(out)) {
    log("RECHAZADO — la prueba no es para esta cuenta");
    process.exit(0);
  }

  log("resultado inesperado:");
  console.log(out.slice(-800));
  process.exit(r.status === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
