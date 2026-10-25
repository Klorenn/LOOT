#!/usr/bin/env node
/**
 * Bot atacante contra el cofre NORMAL (sin ZK). Flujo determinista:
 *   1. el jugador cobra con la respuesta en claro (tx A)
 *   2. el bot LEE la tx A del ledger, extrae la respuesta y cobra (tx B)
 *
 * Uso:  node bot/steal-normal.mjs
 * Requiere RELAYER_SECRET en el entorno (p. ej. `--env-file app/.env.local`).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runNormalChestFlow } from "../app/lib/normal-chest.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

function log(msg) {
  const line = `[bot ${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
}

const secret = process.env.RELAYER_SECRET;
if (!secret) {
  console.error("Falta RELAYER_SECRET (usá --env-file app/.env.local)");
  process.exit(2);
}

try {
  const r = await runNormalChestFlow({
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    contractId: "CAAHCYL56HSHLD7CYX7ESJXRLZG47HVJZ7QTL4MUD4L5H2A5PR4B4HSV",
    chestId: 1,
    tokenId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    assetCode: "USDC",
    assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    relayerSecret: secret,
    playerAnswer: "8",
    log,
  });
  writeFileSync(join(ROOT, "bot/last-steal-normal.json"), JSON.stringify(r, null, 2));
  log(`tx A (jugador): ${EXPLORER}${r.playerTx}`);
  log(`tx B (bot):     ${EXPLORER}${r.botTx}`);
  log("ROBADO — el cofre normal pagó al bot");
} catch (e) {
  console.error(e);
  process.exit(1);
}
