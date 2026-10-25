#!/usr/bin/env node
// OSINT-only scan (read-only, sends NO transactions).
//
// The `kuyfi` CLI (v0.1.0) has no OSINT-only mode: `kuyfi <id>` always runs
// Chaos Monkey after the scan. The installed package does ship the scanner as
// a module, so we call it directly (same code the TUI "Scanner" screen uses)
// and serialize it with a mirror of Kuyfi's `toPublicScan` projection.
//
// Usage: node scripts/kuyfi-osint.mjs <CONTRACT_ID> <out.json>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const [contractId, outPath] = process.argv.slice(2);
if (!contractId || !outPath) {
  console.error("usage: kuyfi-osint.mjs <CONTRACT_ID> <out.json>");
  process.exit(2);
}

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const distDir = process.env.KUYFI_DIST ?? join(globalRoot, "@kuyfi", "kuyfi", "dist");
const load = (rel) => import(pathToFileURL(join(distDir, rel)).href);

const { scanContract, isValidContractId, ScanError } = await load("modules/scanner.js");
const { getToolVersion } = await load("modules/security_report.js");
const { typeName } = await load("modules/chaos_monkey/type_gen.js");
const { TESTNET_RPC_URL } = await load("modules/network.js");
// The SDK is a dependency of kuyfi itself; resolve it from there.
const sdk = createRequire(join(distDir, "..", "package.json"))("@stellar/stellar-sdk");
const { rpc } = sdk;

if (!isValidContractId(contractId)) {
  console.error(`Invalid Contract ID: ${contractId}`);
  process.exit(2);
}

const server = new rpc.Server(TESTNET_RPC_URL);

// Stellar Asset Contracts (built-in token contracts, e.g. native XLM) have no WASM and
// are not ours: skip them with exit code 3 instead of reporting a scan failure.
try {
  const { entries } = await server.getLedgerEntries(new sdk.Contract(contractId).getFootprint());
  const exec = entries[0]?.val.contractData().val().instance().executable().switch().name;
  if (exec === "contractExecutableStellarAsset") {
    console.log(`excluded (Stellar built-in asset contract, not ours): ${contractId}`);
    process.exit(3);
  }
} catch {
  // Detection is best-effort; fall through to the normal scan and its own errors.
}

let scan;
try {
  scan = await scanContract(contractId, server);
} catch (e) {
  console.error(e instanceof ScanError ? `Scan failed (${e.code}): ${e.message}` : e);
  process.exit(1);
}

// Same projection as `toPublicScan` in the kuyfi repo (security_report.ts). The npm
// release 0.1.0 does not export it yet, so it is mirrored here from the exported pieces.
const toPublicUdt = (d) =>
  d.kind === "struct"
    ? { kind: "struct", name: d.name, fields: d.fields.map((f) => ({ name: f.name, type: typeName(f.type) })) }
    : d.kind === "enum"
      ? { kind: "enum", name: d.name, cases: d.cases.map((c) => ({ name: c.name, value: c.value })) }
      : { kind: "union", name: d.name, cases: d.cases.map((c) => ({ name: c.name, valueTypes: c.valueTypes.map(typeName) })) };
const toPublicScan = (s) => ({
  totalFunctions: s.functions.length,
  functions: s.functions.map((fn) => ({
    name: fn.name,
    parameters: fn.params.map((p) => ({ name: p.name, type: typeName(p.type) })),
    hasReturn: fn.hasReturn,
  })),
  udts: [...s.udtRegistry.values()].map(toPublicUdt),
});

const now = new Date();
const report = {
  schemaVersion: "1.0.0",
  reportId: `kyf-osint-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
  generatedAt: now.toISOString(),
  // Marks this file as surface mapping only: there is deliberately no
  // `summary`/`findings`, so nobody can read "0 findings" out of it.
  mode: "osint",
  tool: { name: "kuyfi", version: getToolVersion() },
  target: {
    contractId: scan.contractId,
    network: "testnet",
    rpcUrl: TESTNET_RPC_URL,
    bytecodeSize: scan.bytecodeSize,
  },
  scan: toPublicScan(scan),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(`OSINT: ${report.scan.totalFunctions} function(s), ${report.scan.udts.length} UDT(s) -> ${outPath}`);
