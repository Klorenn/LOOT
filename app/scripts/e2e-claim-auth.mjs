#!/usr/bin/env node
// TESTNET ONLY. End-to-end check of the player-signed claim on registry v2 (recipient.require_auth):
//   create chest -> prove (existing ceremony zkey) -> relayer prepares -> PLAYER signs the auth entry ->
//   relayer pays the fee and submits -> second claim, same address, different playerSecret -> #16.
// Uses the same SDK functions as app/app/api/claim/route.ts (prepareClaimAuth, checkClaimAuthEntry,
// buildClaimTxWithAuth, sendAndWait). The answer, salt and player secrets are random, in-process only:
// nothing secret is printed or written.
//
// Usage (from app/):
//   CREATOR_SECRET="$(stellar keys show loot-v2-throwaway)" node scripts/e2e-claim-auth.mjs [registryId]
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Keypair, Networks, hash } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Server } from "@stellar/stellar-sdk/rpc";
import {
  ClientV2,
  buildClaimTxWithAuth,
  checkClaimAuthEntry,
  prepareClaimAuth,
  sendAndWait,
  signClaimAuthEntry,
} from "@findloot/chest";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

const REGISTRY = process.argv[2] || "CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG";
const RPC = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const ZK = join(dirname(fileURLToPath(import.meta.url)), "../../circuits/ceremony/release-2026-10-26/app/zk");
const PRIZE = 10_000_000n; // 1 XLM

if (!process.env.CREATOR_SECRET) throw new Error("CREATOR_SECRET missing (testnet creator identity)");
const creator = Keypair.fromSecret(process.env.CREATOR_SECRET.trim());
const server = new Server(RPC);
const log = (...a) => console.log("[e2e]", ...a);

const rndField = () => BigInt("0x" + randomBytes(31).toString("hex"));
const hex64 = (v) => BigInt(v).toString(16).padStart(64, "0");
function recipientField(addr) {
  const d = Buffer.from(hash(Address.fromString(addr).toScVal().toXDR()));
  d[0] = 0;
  return BigInt("0x" + d.toString("hex"));
}
async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
async function xlm(addr) {
  const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`);
  const j = await r.json();
  return j.balances.find((b) => b.asset_type === "native").balance;
}

const poseidon = await buildPoseidon();
const P = (a, b) => poseidon.F.toObject(poseidon([a, b]));

async function prove({ answer, salt, playerSecret, groupId, recipient }) {
  const { proof } = await snarkjs.groth16.fullProve(
    {
      answer: answer.toString(),
      salt: salt.toString(),
      playerSecret: playerSecret.toString(),
      chestId: groupId.toString(),
      recipient: recipientField(recipient).toString(),
    },
    join(ZK, "chest.wasm"),
    join(ZK, "chest_final.zkey"),
  );
  const buf = (h) => Buffer.from(h, "hex");
  return {
    nullifier: buf(hex64(P(playerSecret, groupId))),
    proof: {
      a: buf(hex64(proof.pi_a[0]) + hex64(proof.pi_a[1])),
      b: buf(hex64(proof.pi_b[0][1]) + hex64(proof.pi_b[0][0]) + hex64(proof.pi_b[1][1]) + hex64(proof.pi_b[1][0])),
      c: buf(hex64(proof.pi_c[0]) + hex64(proof.pi_c[1])),
    },
  };
}

// relayer = fee payer, player = recipient; both fresh testnet accounts
const relayer = Keypair.random();
const player = Keypair.random();
await Promise.all([fund(relayer), fund(player)]);
log("relayer", relayer.publicKey(), "player", player.publicKey());

// 1. create the chest (creator signs + pays: creating is not part of this check)
const answer = rndField();
const salt = rndField();
const fingerprint = Buffer.from(hex64(P(answer, salt)), "hex");
const cc = new ClientV2({
  contractId: REGISTRY,
  networkPassphrase: PASS,
  rpcUrl: RPC,
  publicKey: creator.publicKey(),
  ...basicNodeSigner(creator, PASS),
});
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const created = await (
  await cc.create_chest({
    creator: creator.publicKey(),
    fingerprint,
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    prize: PRIZE,
    max_claims: 3,
    deadline,
  })
).signAndSend();
const chestId = created.result.unwrap();
const groupId = (await cc.get_chest({ chest_id: chestId })).result.unwrap().group_id;
log("create_chest tx", created.sendTransactionResponse?.hash, "chest", chestId.toString(), "group", groupId.toString());

const relay = async (args, signer) => {
  const o = { networkPassphrase: PASS, contractId: REGISTRY, source: relayer.publicKey(), args };
  const prep = await prepareClaimAuth(server, o); // relayer: simulate, get the unsigned entry
  const signed = await signClaimAuthEntry(prep.authEntry, signer, prep.validUntilLedger, PASS); // PLAYER signs
  const auth = checkClaimAuthEntry(signed, { contractId: REGISTRY, args, currentLedger: prep.latestLedger });
  const { tx, resourceFee } = await buildClaimTxWithAuth(server, { ...o, auth, fee: "1000", instructionLeeway: 100_000_000 });
  tx.sign(relayer); // relayer signs the envelope only: it pays the fee
  return { ...(await sendAndWait(server, tx)), resourceFee };
};

// 2a. the same valid claim signed by someone other than the recipient must be refused
const before = await xlm(player.publicKey());
const p1 = await prove({ answer, salt, playerSecret: rndField(), groupId, recipient: player.publicKey() });
const args1 = { chestId, recipient: player.publicKey(), ...p1 };
try {
  await relay(args1, Keypair.random());
  throw new Error("UNEXPECTED: a non-recipient signature was accepted");
} catch (e) {
  if (/UNEXPECTED/.test(e.message)) throw e;
  if (!/Error\(Auth,/.test(e.message.split("\n")[0])) throw new Error(`expected an auth failure: ${e.message.slice(0, 200)}`);
  log("claim signed by someone else -> refused:", e.message.split("\n")[0].slice(0, 160));
}

// 2b. claim #1: player-signed auth, relayer-paid fee
const r1 = await relay(args1, player);
const after = await xlm(player.publicKey());
log("claim #1 tx", r1.hash, "ledger", r1.ledger, "resourceFee", r1.resourceFee.toString(), "stroops");
log("player XLM", before, "->", after, "(player paid no fee)");
if (Number(after) - Number(before) !== 1) throw new Error("player balance should grow by exactly the 1 XLM prize");

// 3. second claim, SAME address, DIFFERENT playerSecret (new nullifier) -> AlreadyClaimed #16
const p2 = await prove({ answer, salt, playerSecret: rndField(), groupId, recipient: player.publicKey() });
const args2 = { chestId, recipient: player.publicKey(), ...p2 };
try {
  await relay(args2, player);
  throw new Error("UNEXPECTED: second claim went through");
} catch (e) {
  const code = e.message.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];
  if (code !== "16") throw new Error(`expected #16, got: ${e.message.slice(0, 300)}`);
  log("second claim, same address, new playerSecret -> Error(Contract, #16) AlreadyClaimed");
}
log("OK");
process.exit(0); // snarkjs keeps worker threads alive
