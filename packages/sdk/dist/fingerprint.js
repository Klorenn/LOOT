import { hash } from "@stellar/stellar-sdk";
import { buildPoseidon } from "circomlibjs";
import { normalizeAnswer } from "./normalize.js";
let poseidonPromise = null;
async function poseidon() {
    if (!poseidonPromise)
        poseidonPromise = buildPoseidon();
    return poseidonPromise;
}
/** Encode answer text/number to BN254 field element (same as the app). */
export function answerToField(answer) {
    const trimmed = answer.trim();
    if (/^\d+$/.test(trimmed))
        return BigInt(trimmed);
    const digest = hash(Buffer.from(trimmed, "utf8"));
    const arr = Buffer.from(digest);
    arr[0] = 0;
    return BigInt("0x" + arr.toString("hex"));
}
export async function poseidon2(a, b) {
    const p = await poseidon();
    return p.F.toObject(p([a, b]));
}
export function fieldToHex(fe) {
    return BigInt(fe).toString(16).padStart(64, "0");
}
/**
 * Fingerprint = Poseidon(answerField, salt).
 * Normalizes the answer first (trim, lower, no accents/spaces).
 */
export async function fingerprintAnswer(answer, salt) {
    const normalized = normalizeAnswer(answer);
    const fe = answerToField(normalized);
    const fp = await poseidon2(fe, BigInt(salt));
    return { fingerprintHex: fieldToHex(fp), normalized };
}
