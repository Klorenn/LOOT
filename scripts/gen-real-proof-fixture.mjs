#!/usr/bin/env node
// Regenerates contracts/chest/fixtures/real_proof.json and contracts/chest/src/fixture_real_proof.rs.
//
// REAL Groth16 proofs for the EXISTING circuit, made with the EXISTING ceremony artifacts
// (circuits/ceremony/release-2026-10-26/app/zk/{chest.wasm,chest_final.zkey}). Nothing is regenerated
// in the setup: no new zkey, no new VK. The proof verifies against contracts/verifier-mainnet
// (wasm sha256 8df17eda...05b5, vk_fingerprint 3889d2e9...070ef).
//
// Inputs are DUMMY values (never a real chest answer). chestId = GROUP_ID: for a set it is the set id,
// for a normal chest it is the chest id (registry v2: Chest.group_id). Fixture uses group id 1, which
// is the first id handed out by a fresh registry, so the same proof is valid for the first normal chest
// OR for the first set of a fresh registry.
//
// Usage (from repo root): node scripts/gen-real-proof-fixture.mjs      (needs `snarkjs` on PATH)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REL = join(ROOT, "circuits/ceremony/release-2026-10-26");
const WASM = join(REL, "app/zk/chest.wasm");
const ZKEY = join(REL, "app/zk/chest_final.zkey");
const VKEY = join(REL, "verification_key.json");
const OUT_JSON = join(ROOT, "contracts/chest/fixtures/real_proof.json");
const OUT_RS = join(ROOT, "contracts/chest/src/fixture_real_proof.rs");

// Dummy inputs. RECIPIENT is a CONTRACT address (C...) made of 32 bytes of 0x07: nobody controls it, and a
// contract address can hold the SAC balance in tests without a trustline.
// Three proofs, all for GROUP_ID and the same (dummy) answer/salt, so the same fingerprint:
//   main   : recipient 0x07.., playerSecret A
//   secret2: recipient 0x07.., playerSecret B  -> SAME address, different nullifier (must hit AlreadyClaimed #16)
//   other  : recipient 0x08.., playerSecret C  -> a DIFFERENT address (sybil: claims once, by design)
const GROUP_ID = 1n;
const DUMMY = { answer: "123456789", salt: "987654321" };
const VARIANTS = [
  { name: "main", hashByte: 7, playerSecret: "424242" },
  { name: "secret2", hashByte: 7, playerSecret: "434343" },
  { name: "other", hashByte: 8, playerSecret: "444444" },
];

for (const f of [WASM, ZKEY, VKEY]) if (!existsSync(f)) throw new Error(`missing ${f}`);

// strkey for a contract id: base32(version 2<<3 | 32 bytes | crc16-xmodem LE)
function strkeyC(raw) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const p = Buffer.concat([Buffer.from([2 << 3]), raw]);
  let crc = 0;
  for (const byte of p) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  const d = Buffer.concat([p, Buffer.from([crc & 255, crc >> 8])]);
  let bits = 0, v = 0, o = "";
  for (const byte of d) {
    v = (v << 8) | byte; bits += 8;
    while (bits >= 5) { o += A[(v >> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) o += A[(v << (5 - bits)) & 31];
  return o;
}
// Same rule as the contract: sha256(xdr(ScVal::Address)) with byte[0] = 0.
function recipientField(contractHash) {
  const xdr = Buffer.concat([
    Buffer.from([0, 0, 0, 18]), // SCV_ADDRESS
    Buffer.from([0, 0, 0, 1]), // SC_ADDRESS_TYPE_CONTRACT
    contractHash,
  ]);
  const h = createHash("sha256").update(xdr).digest();
  h[0] = 0;
  return BigInt("0x" + h.toString("hex"));
}

const dir = mkdtempSync(join(tmpdir(), "chestzk-fixture-"));
const snark = (...a) => execFileSync("snarkjs", a, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const fe = (d) => BigInt(d).toString(16).padStart(64, "0");

function prove(v) {
  const hash = Buffer.alloc(32, v.hashByte);
  const inputPath = join(dir, `${v.name}.input.json`);
  const input = { ...DUMMY, playerSecret: v.playerSecret, chestId: GROUP_ID.toString(), recipient: recipientField(hash).toString() };
  writeFileSync(inputPath, JSON.stringify(input));
  const proofPath = join(dir, `${v.name}.proof.json`);
  const pubPath = join(dir, `${v.name}.public.json`);
  snark("groth16", "fullprove", inputPath, WASM, ZKEY, proofPath, pubPath);
  const ok = snark("groth16", "verify", VKEY, pubPath, proofPath);
  if (!/OK/.test(ok)) throw new Error("snarkjs verify failed: " + ok);
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  const publicSignals = JSON.parse(readFileSync(pubPath, "utf8")); // [fingerprint, nullifier, chestId, recipient]
  if (publicSignals.length !== 4) throw new Error("expected 4 public signals");
  // snarkjs -> Soroban wire format (ethereum uncompressed): G2 is (x_im, x_re, y_im, y_re)
  const a = fe(proof.pi_a[0]) + fe(proof.pi_a[1]);
  const b = fe(proof.pi_b[0][1]) + fe(proof.pi_b[0][0]) + fe(proof.pi_b[1][1]) + fe(proof.pi_b[1][0]);
  const c = fe(proof.pi_c[0]) + fe(proof.pi_c[1]);
  const publics = publicSignals.map(fe);
  return {
    recipient: strkeyC(hash),
    input: { ...input, answer: "<dummy>", salt: "<dummy>", playerSecret: "<dummy>" },
    proof,
    publicSignals,
    wire: { a, b, c, publics },
  };
}

const out = Object.fromEntries(VARIANTS.map((v) => [v.name, prove(v)]));
const main = out.main;
if (out.secret2.recipient !== main.recipient) throw new Error("secret2 must share the main recipient");
if (out.secret2.wire.publics[1] === main.wire.publics[1]) throw new Error("secret2 must have a different nullifier");
if (out.other.wire.publics[0] !== main.wire.publics[0]) throw new Error("fingerprints must match");

writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      note: "DUMMY inputs. Real Groth16 proofs from the ceremony zkey. Regenerate: node scripts/gen-real-proof-fixture.mjs",
      verifierWasmSha256: "8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5",
      vkFingerprint: "3889d2e915b1118b40c0c825608bde088208f5d5b6e60ce4145b47a40fe070ef",
      groupId: GROUP_ID.toString(),
      recipient: main.recipient,
      input: main.input,
      proof: main.proof,
      publicSignals: main.publicSignals,
      wire: main.wire,
      variants: { secret2: out.secret2, other: out.other },
    },
    null,
    2,
  ) + "\n",
);

const arr = (hex) => "[" + hex.match(/../g).map((x) => "0x" + x).join(", ") + "]";
const block = (prefix, v) => `pub const ${prefix}PROOF_A: [u8; 64] = ${arr(v.wire.a)};
pub const ${prefix}PROOF_B: [u8; 128] = ${arr(v.wire.b)};
pub const ${prefix}PROOF_C: [u8; 64] = ${arr(v.wire.c)};
pub const ${prefix}NULLIFIER: [u8; 32] = ${arr(v.wire.publics[1])};
`;
writeFileSync(
  OUT_RS,
  `// AUTO-GENERATED by scripts/gen-real-proof-fixture.mjs from fixtures/real_proof.json. DO NOT EDIT.
// Real Groth16 proofs (ceremony zkey), dummy inputs. Group id ${GROUP_ID}, recipient ${main.recipient}.
pub const GROUP_ID: u64 = ${GROUP_ID};
pub const RECIPIENT: &str = "${main.recipient}";
${block("", main)}pub const FINGERPRINT: [u8; 32] = ${arr(main.wire.publics[0])};
pub const RECIPIENT_FIELD: [u8; 32] = ${arr(main.wire.publics[3])};
// SAME recipient, different playerSecret (so a different nullifier).
${block("SECRET2_", out.secret2)}// A DIFFERENT recipient (sybil case: a fresh address claims once).
pub const OTHER_RECIPIENT: &str = "${out.other.recipient}";
${block("OTHER_", out.other)}`,
);
console.log("wrote", OUT_JSON, "and", OUT_RS);
