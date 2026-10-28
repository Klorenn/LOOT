import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128 } from "@stellar/stellar-sdk/contract";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CAEBFT22DIJNNJ6CLHY5L3SKLSACRHJLJW22VQAKTI3MCCP5KTO277NJ";
    };
};
export interface Chest {
    claims: u32;
    closed: boolean;
    creator: string;
    deadline: u64;
    fingerprint: Buffer;
    /**
   * Id pushed to the circuit as the `chestId` public input. For a normal
   * chest it equals the chest id; for chests in a set it is the set id.
   */
    group_id: u64;
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
    12: {
        message: string;
    };
    13: {
        message: string;
    };
    /**
     * create_chest / create_chest_in_set received a token other than the one fixed in the constructor.
     */
    14: {
        message: string;
    };
    /**
     * Deadline must satisfy now < deadline <= now + MAX_DEADLINE.
     */
    15: {
        message: string;
    };
    /**
     * This recipient already claimed in this group (chest or set). Does NOT stop fresh addresses.
     */
    16: {
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
/**
 * This contract is immutable (no upgrade path): changes mean a new deployment.
 */
export type DataKey = {
    tag: "Verifier";
    values: void;
} | {
    tag: "Token";
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
} | {
    tag: "Claimed";
    values: readonly [u64, string];
} | {
    tag: "SetOwner";
    values: readonly [u64];
};
export interface Client {
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
     * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a get_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_chest: ({ chest_id }: {
        chest_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Chest>>>;
    /**
     * Construct and simulate a create_set transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Allocate a set id (from the same counter as chest ids, so it can never
     * equal any chest id or any other set id). Only `creator` can add chests.
     */
    create_set: ({ creator }: {
        creator: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>;
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
    /**
     * Construct and simulate a create_chest_in_set transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Create a chest inside a set made with `create_set`. All chests of a set
     * share the nullifier domain: one claim per account per set.
     */
    create_chest_in_set: ({ creator, set_id, fingerprint, token, prize, max_claims, deadline }: {
        creator: string;
        set_id: u64;
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
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { verifier, token }: {
        verifier: string;
        token: string;
    }, 
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
        claim: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        token: (json: string) => AssembledTransaction<string>;
        version: (json: string) => AssembledTransaction<number>;
        verifier: (json: string) => AssembledTransaction<string>;
        get_chest: (json: string) => AssembledTransaction<Result<Chest, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        create_set: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        close_chest: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        create_chest: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        create_chest_in_set: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
