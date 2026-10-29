#!/usr/bin/env node
// TESTNET ONLY. Browser end-to-end check of the registry v2 claim with a passkey (Face ID) wallet and with a demo key,
// against a running app (pnpm build && pnpm start with NEXT_PUBLIC_REGISTRY_VERSION=2 and the v2 ids).
// Chrome runs with a CDP virtual authenticator, so every WebAuthn ceremony is real but needs no human.
//   1. passkey: create the wallet from the chest page, solve and claim chest A
//   2. reload, open chest B (same wallet, kit not connected) and claim it
//   3. demo G key: claim chest C in a fresh browser context
// Answers and salts are random, in-process only: nothing secret is printed or written.
//
// Usage (from app/):
//   CREATOR_SECRET="$(stellar keys show <testnet id>)" PLAYWRIGHT=<path to playwright> \
//     node scripts/e2e-passkey-claim.mjs [baseUrl]
import { randomBytes, randomInt } from "node:crypto";
import { Address, Keypair, Networks } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { ClientV2 } from "@findloot/chest";
import { argon2id } from "hash-wasm";
import { buildPoseidon } from "circomlibjs";
import Sqids from "sqids";

const BASE = process.argv[2] || "http://localhost:3123";
const REGISTRY = process.env.REGISTRY_V2_ID || "CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG";
const RPC = "https://soroban-testnet.stellar.org";
const XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const V2_REF_OFFSET = 1_000_000_000;
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");

if (!process.env.CREATOR_SECRET) throw new Error("CREATOR_SECRET missing (testnet creator identity)");
const creator = Keypair.fromSecret(process.env.CREATOR_SECRET.trim());
const log = (...a) => console.log("[e2e-passkey]", ...a);
const sqids = new Sqids({ alphabet: "tzgqv5iywm3e4s62r7bc8fnoup1jhald9x0k", minLength: 8 });
const poseidon = await buildPoseidon();
const hex64 = (v) => BigInt(v).toString(16).padStart(64, "0");

// same derivation as lib/kdf.ts argon2id-v1 (answer = digits, already normalized)
async function answerField(answer, salt) {
  const out = await argon2id({
    password: new TextEncoder().encode(answer),
    salt: Buffer.from(salt.toString(16).padStart(62, "0"), "hex"),
    parallelism: 1,
    iterations: 2,
    memorySize: 19 * 1024,
    hashLength: 32,
    outputType: "binary",
  });
  const b = Uint8Array.from(out);
  b[0] = 0;
  return BigInt("0x" + Buffer.from(b).toString("hex"));
}

async function meta(body) {
  const r = await fetch(`${BASE}/api/chests/meta`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`meta ${body.action}: ${r.status} ${await r.text()}`);
}

/** Creates a listed 1-claim, 1 XLM v2 chest the way /create does; returns its code and (secret) answer. */
async function createChest(label) {
  const answer = Array.from({ length: 16 }, () => randomInt(10)).join("");
  const salt = BigInt("0x" + randomBytes(31).toString("hex"));
  const fingerprintHex = hex64(poseidon.F.toObject(poseidon([await answerField(answer, salt), salt])));
  await meta({
    action: "reserve",
    creator: creator.publicKey(),
    fingerprintHex,
    maxClaims: 1,
    question: `e2e passkey ${label}`,
    prize: 1,
    listed: true,
    salt: salt.toString(),
    kdf: "argon2id-v1",
  });
  const cc = new ClientV2({
    contractId: REGISTRY,
    networkPassphrase: Networks.TESTNET,
    rpcUrl: RPC,
    publicKey: creator.publicKey(),
    ...basicNodeSigner(creator, Networks.TESTNET),
  });
  const tx = await (
    await cc.create_chest({
      creator: creator.publicKey(),
      fingerprint: Buffer.from(fingerprintHex, "hex"),
      token: XLM_SAC,
      prize: 10_000_000n,
      max_claims: 1,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    })
  ).signAndSend();
  const ref = V2_REF_OFFSET + Number(tx.result.unwrap());
  const txHash = tx.sendTransactionResponse?.hash;
  await meta({ action: "confirm", chestId: ref, fingerprintHex, txHash });
  const code = sqids.encode([ref]);
  log(`chest ${label}: ref ${ref} code ${code} create tx ${txHash}`);
  return { code, answer };
}

async function newContext(browser, withAuthenticator) {
  const ctx = await browser.newContext();
  const ceremonies = [];
  await ctx.exposeBinding("__waLog", (_src, kind) => ceremonies.push(kind));
  // count every WebAuthn ceremony the page starts (create = registration, get = assertion / Face ID prompt)
  await ctx.addInitScript(() => {
    const c = navigator.credentials;
    if (!c) return;
    const create = c.create.bind(c);
    const get = c.get.bind(c);
    c.create = (o) => (o?.publicKey && window.__waLog("create"), create(o));
    c.get = (o) => (o?.publicKey && window.__waLog("get"), get(o));
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") log(`  console.${m.type()}:`, m.text().slice(0, 300));
  });
  if (withAuthenticator) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
  }
  return { ctx, page, ceremonies };
}

async function solveAndClaim(page, code, answer) {
  await page.getByPlaceholder("type your answer").fill(answer);
  await page.getByRole("button", { name: "Generate proof and claim" }).click();
  try {
    await page.waitForURL(`**/chest/${code}/claimed`, { timeout: 240_000 });
  } catch (e) {
    const body = (await page.locator("main").innerText().catch(() => "")).slice(0, 800);
    throw new Error(`claim of ${code} did not land: ${body}`);
  }
  const ref = sqids.decode(code)[0];
  const rec = await page.evaluate((k) => sessionStorage.getItem(k), `chestzk.claim.${ref}`);
  return JSON.parse(rec ?? "{}").hash;
}

const CONNECTED = "Connected. The prize goes to this address.";
const delta = (list, from) => {
  const d = list.slice(from);
  return `${d.filter((k) => k === "create").length} create + ${d.filter((k) => k === "get").length} get`;
};

const [A, B, C] = [await createChest("A"), await createChest("B"), await createChest("C")];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // 1. passkey: create wallet + claim A
  const pk = await newContext(browser, true);
  await pk.page.goto(`${BASE}/chest/${A.code}?net=testnet`);
  await pk.page.getByRole("button", { name: "Continue with passkey" }).click();
  await pk.page.getByText(CONNECTED).waitFor({ timeout: 180_000 });
  const player = await pk.page.evaluate(() => JSON.parse(localStorage.getItem("chestzk.player") ?? "{}").publicKey);
  log(`passkey wallet ${player} created: ${delta(pk.ceremonies, 0)}`);
  if (!player?.startsWith("C") || !Address.fromString(player)) throw new Error("no passkey C wallet in session");
  let mark = pk.ceremonies.length;
  const hashA = await solveAndClaim(pk.page, A.code, A.answer);
  log(`claim A (same session as wallet creation) tx ${hashA}: ${delta(pk.ceremonies, mark)}`);

  // 2. reload (kit loses its connected wallet) + claim B
  mark = pk.ceremonies.length;
  await pk.page.goto(`${BASE}/chest/${B.code}?net=testnet`);
  await pk.page.getByText(CONNECTED).waitFor({ timeout: 60_000 });
  await pk.page.waitForTimeout(3000); // let the session-restore effect run
  log(`page load after reload: ${delta(pk.ceremonies, mark)}`);
  mark = pk.ceremonies.length;
  const hashB = await solveAndClaim(pk.page, B.code, B.answer);
  log(`claim B (after reload, same wallet) tx ${hashB}: ${delta(pk.ceremonies, mark)}`);
  await pk.ctx.close();

  // 3. demo G key in a fresh context
  const demo = await newContext(browser, false);
  await demo.page.goto(`${BASE}/chest/${C.code}?net=testnet`);
  await demo.page.getByRole("button", { name: "or use a throwaway demo wallet" }).click();
  await demo.page.getByText(CONNECTED).waitFor({ timeout: 60_000 });
  // G accounts get the optional display-name prompt
  await demo.page.getByRole("button", { name: "Skip for now" }).click({ timeout: 10_000 }).catch(() => undefined);
  const hashC = await solveAndClaim(demo.page, C.code, C.answer);
  log(`claim C (demo G key) tx ${hashC}`);
  await demo.ctx.close();
  log("OK");
} finally {
  await browser.close();
}
process.exit(0);
