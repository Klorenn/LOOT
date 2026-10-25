import * as snarkjs from "snarkjs";
export type ChestProof = {
    a: string;
    b: string;
    c: string;
};
export type CircuitArtifacts = {
    wasm: string;
    zkey: string;
};
export type ProveInput = {
    answer: bigint;
    salt: bigint;
    playerSecret: bigint;
    chestId: bigint;
    recipient: bigint;
};
export type ProveResult = {
    proof: ChestProof;
    /** [fingerprint, nullifier, chestId, recipient] */
    publicSignals: string[];
    nullifierHex: string;
    fingerprintHex: string;
};
/** snarkjs proof -> verifier wire format (ethereum uncompressed, G2 limbs swapped). */
export declare function snarkToContractProof(proof: snarkjs.Groth16Proof): ChestProof;
/** Browser: /zk/*. Node: CHESTZK_ZK_DIR or the monorepo's app/public/zk. */
export declare function defaultCircuit(): Promise<CircuitArtifacts>;
export declare function proveChest(input: ProveInput, circuit?: CircuitArtifacts): Promise<ProveResult>;
