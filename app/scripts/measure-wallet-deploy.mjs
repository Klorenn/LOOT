#!/usr/bin/env node
// TESTNET, read-only. Measures what a sponsored passkey wallet deploy costs by SIMULATING the same deploy the app
// sends: passkey-kit's shared-deployer CreateContractV2 of the canonical wallet wasm (lib/network.ts WALLET_WASM_HASH)
// with a secp256r1 signer and a valid Genesis binding proof (made here with a throwaway P-256 key, the same bytes a
// WebAuthn authenticator would return). Nothing is signed by a funded key and nothing is sent.
// Used to size the testnet wallet_deploy fee cap (lib/relay-fee-cap.ts).
//
// Usage (from app/): node scripts/measure-wallet-deploy.mjs [runs]
import { createHash, generateKeyPairSync, randomBytes, sign as ecSign } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Networks } from "@stellar/stellar-sdk";

const WALLET_WASM_HASH = "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";
const RPC = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const PK = join(dirname(fileURLToPath(import.meta.url)), "../node_modules/passkey-kit/dist");
const imp = (f) => import(pathToFileURL(join(PK, f)).href);
const [{ buildDeployTransaction, resolveDeployer }, { bindingChallenge }, { deriveContractAddress }] = await Promise.all([
  imp("kit/deploy-ops.js"),
  imp("kit/webauthn-verify.js"),
  imp("utils.js"),
]);
const { PasskeyClient } = await import("passkey-kit");

const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const sha = (b) => createHash("sha256").update(b).digest();

async function once() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  const keyId = randomBytes(20);
  const deployer = resolveDeployer();
  const contractId = deriveContractAddress(keyId, deployer.publicKey(), PASS);
  const signer = { tag: "Secp256r1", values: [keyId, pub, [undefined], [undefined], { tag: "Persistent", values: undefined }] };
  const spec = new PasskeyClient({ contractId, rpcUrl: RPC, networkPassphrase: PASS }).spec;
  const challenge = Buffer.from(bindingChallenge({ spec, networkPassphrase: PASS, contractId, purpose: "Genesis", signer }));
  const authenticatorData = Buffer.concat([sha("findloot.xyz"), Buffer.from([0x05, 0, 0, 0, 1])]);
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: "webauthn.get", challenge: challenge.toString("base64url"), origin: "https://findloot.xyz" }),
  );
  const sig = ecSign("sha256", Buffer.concat([authenticatorData, sha(clientDataJSON)]), { key: privateKey, dsaEncoding: "ieee-p1363" });
  let s = BigInt("0x" + sig.subarray(32).toString("hex"));
  if (s > N / BigInt(2)) s = N - s; // low-S
  const compact = Buffer.concat([sig.subarray(0, 32), Buffer.from(s.toString(16).padStart(64, "0"), "hex")]);
  const proof = { authenticator_data: authenticatorData, client_data_json: clientDataJSON, signature: compact };
  const tx = await buildDeployTransaction(
    {
      rpcUrl: RPC,
      walletWasmHash: WALLET_WASM_HASH,
      networkPassphrase: PASS,
      usingSharedDeployer: true,
      deployerPublicKey: deployer.publicKey(),
      timeoutInSeconds: 30,
    },
    keyId,
    pub,
    proof,
  );
  const sim = tx.simulation;
  if (!sim || sim.error) throw new Error(`simulation failed: ${String(sim?.error).split("\n")[0]}`);
  const r = sim.transactionData.build().resources();
  return { minResourceFee: Number(sim.minResourceFee), instructions: r.instructions(), writeBytes: r.writeBytes() };
}

const runs = Number(process.argv[2] || 3);
const out = [];
for (let i = 0; i < runs; i++) out.push(await once());
const max = Math.max(...out.map((o) => o.minResourceFee));
console.log(JSON.stringify({ runs: out, maxMinResourceFeeStroops: max, maxXlm: max / 1e7 }, null, 2));
