#!/usr/bin/env node
// Read-only check of the deployed registry + verifier vs deployments/registry-mainnet.json.
// Never signs or submits. Usage: node scripts/mainnet/verify-registry.mjs [path/to/registry-*.json]
// SDK resolution: SDK_DIR env, ../../app/node_modules, or the main checkout's app/node_modules.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const file = process.argv[2] ?? resolve(root, "deployments/registry-mainnet.json");
const dep = JSON.parse(readFileSync(file, "utf8"));
const rpcUrl = process.env.RPC_URL ?? dep.rpcUrl ?? "https://mainnet.sorobanrpc.com";
const TESTNET_VK_FP = "161f9d198dd1bcc1aaaa5cc95566cf528ff582e4c27accddd808346d520991c1";

function loadSdk() {
  const bases = [process.env.SDK_DIR && resolve(process.env.SDK_DIR, "package.json"), resolve(root, "app/package.json"),
    resolve(root, "package.json")].filter(Boolean);
  for (const b of bases) { try { if (existsSync(b)) return createRequire(b)("@stellar/stellar-sdk"); } catch {} }
  throw new Error("@stellar/stellar-sdk not found; set SDK_DIR=<dir containing node_modules>");
}
const { rpc, Contract, Account, TransactionBuilder, Networks, scValToNative, nativeToScVal, Address, Asset, BASE_FEE, Keypair, xdr } = loadSdk();
const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http:") });
const hex = (b) => Buffer.from(b).toString("hex");
const wasmHashOf = (inst) => { try { return hex(inst.executable().wasmHash()); } catch { return "(not a wasm contract)"; } };
const bad = [];
const check = (name, ok, got, want) => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : `  on-chain=${got} json=${want}`}`); if (!ok) bad.push(name); };

async function sim(contractId, method, args = []) {
  const src = new Account(Keypair.random().publicKey(), "0"); // throwaway source; simulation only
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
    .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
  return server.simulateTransaction(tx);
}
async function instance(contractId) {
  const r = await server.getLedgerEntries(new Contract(contractId).getFootprint());
  const inst = r.entries[0]?.val.contractData().val().instance();
  return inst ?? null;
}

const net = await server.getNetwork();
check("rpc is mainnet", net.passphrase === Networks.PUBLIC, net.passphrase, Networks.PUBLIC);
check("json passphrase is mainnet", dep.passphrase === Networks.PUBLIC, dep.passphrase, Networks.PUBLIC);
check("token is native XLM SAC", dep.token === Asset.native().contractId(Networks.PUBLIC), dep.token, Asset.native().contractId(Networks.PUBLIC));

// Registry instance: wasm hash + stored Verifier / NextId.
const reg = await instance(dep.registry);
if (!reg) check("registry instance exists", false, "(missing)", dep.registry);
else {
  const h = wasmHashOf(reg);
  check("registry wasm hash", h === dep.registryWasmHash, h, dep.registryWasmHash);
  let storedVerifier = null, nextId = null;
  for (const e of reg.storage() ?? []) {
    const k = scValToNative(e.key());
    if (Array.isArray(k) && k[0] === "Verifier") storedVerifier = scValToNative(e.val());
    if (Array.isArray(k) && k[0] === "NextId") nextId = scValToNative(e.val());
  }
  check("registry initialised (Verifier set)", storedVerifier !== null, storedVerifier, "(set)");
  check("registry verifier == json verifier", storedVerifier === dep.verifier, storedVerifier, dep.verifier);
  check("registry NextId present", nextId !== null, nextId, ">=1");
  if (dep.sampleChest) check("NextId > sample chest id", nextId !== null && BigInt(nextId) > BigInt(dep.sampleChest.id), nextId, dep.sampleChest.id);
  // A second init must fail with AlreadyInit (#10). Simulation only.
  const s = await sim(dep.registry, "init", [new Address(dep.admin).toScVal(), new Address(dep.verifier).toScVal()]);
  const err = rpc.Api.isSimulationError(s) ? String(s.error) : "";
  check("second init rejected (AlreadyInit #10)", /Error\(Contract, #10\)/.test(err), err.slice(0, 80) || "init would succeed!", "Error #10");
}

// Verifier: wasm hash + VK fingerprint must not be the testnet one.
const ver = await instance(dep.verifier);
if (!ver) check("verifier instance exists", false, "(missing)", dep.verifier);
else {
  const h = wasmHashOf(ver);
  check("verifier wasm hash", h === dep.verifierWasmHash, h, dep.verifierWasmHash);
  const s = await sim(dep.verifier, "vk_fingerprint");
  if (rpc.Api.isSimulationError(s)) check("verifier vk_fingerprint callable", false, s.error, "ok");
  else {
    const fp = hex(scValToNative(s.result.retval));
    console.log(`INFO verifier vk_fingerprint ${fp}`);
    check("verifier VK is NOT the testnet VK", fp !== TESTNET_VK_FP, fp, "!= " + TESTNET_VK_FP);
    if (dep.vkFingerprint) check("verifier VK == json vkFingerprint", fp === dep.vkFingerprint, fp, dep.vkFingerprint);
  }
}

// Sample chest (if recorded).
if (dep.sampleChest) {
  const s = await sim(dep.registry, "get_chest", [nativeToScVal(BigInt(dep.sampleChest.id), { type: "u64" })]);
  if (rpc.Api.isSimulationError(s)) check("sample chest readable", false, s.error, "ok");
  else {
    const c = scValToNative(s.result.retval);
    check("chest creator == admin", c.creator === dep.admin, c.creator, dep.admin);
    check("chest token == native SAC", c.token === dep.token, c.token, dep.token);
    check("chest fingerprint", hex(c.fingerprint) === String(dep.sampleChest.fingerprint).toLowerCase(), hex(c.fingerprint), dep.sampleChest.fingerprint);
    check("chest prize", String(c.prize) === String(dep.sampleChest.prizeStroops), c.prize, dep.sampleChest.prizeStroops);
    check("chest max_claims", Number(c.max_claims) === Number(dep.sampleChest.maxClaims), c.max_claims, dep.sampleChest.maxClaims);
    check("chest not closed", c.closed === false, c.closed, false);
  }
}

console.log(bad.length ? `\n${bad.length} mismatch(es)` : "\nall checks passed");
process.exit(bad.length ? 1 : 0);
