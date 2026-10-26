"use client";

import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { zkAssets } from "./config";
import { clientCfg } from "./network";

export type ChestProof = {
  a: string; // 64-byte hex
  b: string; // 128-byte hex
  c: string; // 64-byte hex
};

export type ProveInput = {
  answer: string;
  salt: string;
  playerSecret: string;
  chestId: string;
  recipientField: string; // decimal field element
  /** Etapas para la UI: "witness" al empezar, "prove" antes de snarkjs. */
  onStage?: (stage: "witness" | "prove") => void;
};

export type ProveResult = {
  proof: ChestProof;
  publicSignals: string[]; // [fingerprint, nullifier, chestId, recipient]
  nullifierHex: string;
  fingerprintHex: string;
  timings: { calcMs: number; proveMs: number };
};

let poseidonPromise: Promise<Awaited<ReturnType<typeof buildPoseidon>>> | null =
  null;

async function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const p = await poseidon();
  return p.F.toObject(p([a, b])) as bigint;
}

export function fieldToHex(fe: bigint | string): string {
  return BigInt(fe).toString(16).padStart(64, "0");
}

function feHexFromSnark(s: string): string {
  return BigInt(s).toString(16).padStart(64, "0");
}

/** snarkjs proof → wire format del verificador Soroban (ethereum uncompressed). */
export function snarkToContractProof(proof: snarkjs.Groth16Proof): ChestProof {
  const a = feHexFromSnark(proof.pi_a[0]) + feHexFromSnark(proof.pi_a[1]);
  const b =
    feHexFromSnark(proof.pi_b[0][1]) +
    feHexFromSnark(proof.pi_b[0][0]) +
    feHexFromSnark(proof.pi_b[1][1]) +
    feHexFromSnark(proof.pi_b[1][0]);
  const c = feHexFromSnark(proof.pi_c[0]) + feHexFromSnark(proof.pi_c[1]);
  return { a, b, c };
}

export async function proveChest(input: ProveInput): Promise<ProveResult> {
  const { answerToField, normalizeAnswer } = await import("./answer");
  input.onStage?.("witness");
  const t0 = performance.now();
  const answer = answerToField(normalizeAnswer(input.answer));
  const salt = BigInt(input.salt);
  const playerSecret = BigInt(input.playerSecret);
  const chestId = BigInt(input.chestId);
  const recipient = BigInt(input.recipientField);

  const fingerprint = await poseidon2(answer, salt);
  const nullifier = await poseidon2(playerSecret, chestId);
  const calcMs = performance.now() - t0;

  // la zkey depende de la red activa (ceremonia en mainnet, original en testnet)
  const assets = zkAssets(clientCfg().IS_MAINNET);
  input.onStage?.("prove");
  const t1 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      answer: answer.toString(),
      salt: salt.toString(),
      playerSecret: playerSecret.toString(),
      chestId: chestId.toString(),
      recipient: recipient.toString(),
    },
    assets.wasm,
    assets.zkey,
  );
  const proveMs = performance.now() - t1;

  return {
    proof: snarkToContractProof(proof),
    publicSignals: publicSignals as string[],
    nullifierHex: fieldToHex(nullifier),
    fingerprintHex: fieldToHex(fingerprint),
    timings: { calcMs, proveMs },
  };
}
