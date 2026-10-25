import * as snarkjs from "snarkjs";
const hex32 = (s) => BigInt(s).toString(16).padStart(64, "0");
/** snarkjs proof -> verifier wire format (ethereum uncompressed, G2 limbs swapped). */
export function snarkToContractProof(proof) {
    const a = hex32(proof.pi_a[0]) + hex32(proof.pi_a[1]);
    const b = hex32(proof.pi_b[0][1]) +
        hex32(proof.pi_b[0][0]) +
        hex32(proof.pi_b[1][1]) +
        hex32(proof.pi_b[1][0]);
    const c = hex32(proof.pi_c[0]) + hex32(proof.pi_c[1]);
    return { a, b, c };
}
/** Browser: /zk/*. Node: CHESTZK_ZK_DIR or the monorepo's app/public/zk. */
export async function defaultCircuit() {
    if (typeof window !== "undefined") {
        return { wasm: "/zk/chest.wasm", zkey: "/zk/chest_final.zkey" };
    }
    const { fileURLToPath } = await import(/* webpackIgnore: true */ "node:url");
    const { dirname, join } = await import(/* webpackIgnore: true */ "node:path");
    const dir = process.env.CHESTZK_ZK_DIR ??
        join(dirname(fileURLToPath(import.meta.url)), "../../../app/public/zk");
    return { wasm: join(dir, "chest.wasm"), zkey: join(dir, "chest_final.zkey") };
}
export async function proveChest(input, circuit) {
    const art = circuit ?? (await defaultCircuit());
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({
        answer: input.answer.toString(),
        salt: input.salt.toString(),
        playerSecret: input.playerSecret.toString(),
        chestId: input.chestId.toString(),
        recipient: input.recipient.toString(),
    }, art.wasm, art.zkey);
    return {
        proof: snarkToContractProof(proof),
        publicSignals: publicSignals,
        fingerprintHex: hex32(publicSignals[0]),
        nullifierHex: hex32(publicSignals[1]),
    };
}
