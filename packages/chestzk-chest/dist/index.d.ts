import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";
    };
};
export interface Chest {
    claims: u32;
    closed: boolean;
    creator: string;
    deadline: u64;
    fingerprint: Buffer;
    max_claims: u32;
    prize: i128;
    token: string;
}
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
};
/**
 * Wire-compatible con el `Proof` del verificador generado
 * (a: G1 64B, b: G2 128B, c: G1 64B, ethereum-uncompressed).
 */
export interface Proof {
    a: Buffer;
    b: Buffer;
    c: Buffer;
}
export type DataKey = {
    tag: "Verifier";
    values: void;
} | {
    tag: "NextId";
    values: void;
} | {
    tag: "Chest";
    values: readonly [u64];
} | {
    tag: "Nullifier";
    values: readonly [Buffer];
};
export interface Client {
    /**
     * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    init: ({ admin, verifier }: {
        admin: string;
        verifier: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    claim: ({ chest_id, recipient, nullifier, proof }: {
        chest_id: u64;
        recipient: string;
        nullifier: Buffer;
        proof: Proof;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_chest: ({ chest_id }: {
        chest_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Chest>>>;
    /**
     * Construct and simulate a close_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    close_chest: ({ chest_id }: {
        chest_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>;
    /**
     * Construct and simulate a create_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    create_chest: ({ creator, fingerprint, token, prize, max_claims, deadline }: {
        creator: string;
        fingerprint: Buffer;
        token: string;
        prize: i128;
        max_claims: u32;
        deadline: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        init: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        claim: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_chest: (json: string) => AssembledTransaction<Result<Chest, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        close_chest: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        create_chest: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
/** Registry v2 (sets, constructor, token/deadline checks, group_id). The v1 `Client` above is unchanged. */
export { Client as ClientV2, Errors as ErrorsV2, networks as networksV2 } from "./v2.js";
export type { Chest as ChestV2, Proof as ProofV2 } from "./v2.js";
export { AUTH_VALID_LEDGERS, ClaimSimulationError, buildClaimTxWithAuth, checkClaimAuthEntry, claimArgsToScVals, prepareClaimAuth, sendAndWait, signClaimAuthEntry, } from "./claim-auth.js";
export type { ClaimArgs, TxOpts as ClaimTxOpts } from "./claim-auth.js";
