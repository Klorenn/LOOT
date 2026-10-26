#!/usr/bin/env node
// Read-only: simulate an UNSIGNED transaction envelope (base64 XDR on stdin) against Soroban RPC.
// Never signs, never submits. Prints one JSON line: {ok, minResourceFeeStroops, error?}
// Usage: echo "$XDR" | node simulate-tx.mjs [rpcUrl]
// SDK resolution: SDK_DIR env, ../../app/node_modules (worktree), or the main checkout's app/node_modules.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
function loadSdk() {
  const bases = [process.env.SDK_DIR && resolve(process.env.SDK_DIR, "package.json"), resolve(root, "app/package.json"),
    resolve(root, "package.json"), "/Users/paukoh/Chest ZK/app/package.json"].filter(Boolean);
  for (const b of bases) { try { if (existsSync(b)) return createRequire(b)("@stellar/stellar-sdk"); } catch {} }
  throw new Error("@stellar/stellar-sdk not found; set SDK_DIR=<dir containing node_modules>");
}
const { rpc, TransactionBuilder, Networks } = loadSdk();
const rpcUrl = process.argv[2] ?? process.env.RPC_URL ?? "https://mainnet.sorobanrpc.com";
const xdr = readFileSync(0, "utf8").trim();
const out = (o) => { console.log(JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };
try {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http:") });
  const net = await server.getNetwork();
  if (net.passphrase !== Networks.PUBLIC) out({ ok: false, error: `RPC is not mainnet: ${net.passphrase}` });
  const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC);
  const sim = await server.simulateTransaction(tx); // simulateTransaction never submits
  if (rpc.Api.isSimulationError(sim)) out({ ok: false, error: String(sim.error).slice(0, 300) });
  out({ ok: true, minResourceFeeStroops: String(sim.minResourceFee) });
} catch (e) { out({ ok: false, error: String(e.message ?? e).slice(0, 300) }); }
