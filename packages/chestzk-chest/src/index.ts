import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
  }
} as const


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

export const Errors = {
  1: {message:"ChestNotFound"},
  2: {message:"ChestClosed"},
  3: {message:"ChestExpired"},
  4: {message:"SoldOut"},
  5: {message:"NullifierUsed"},
  6: {message:"InvalidProof"},
  7: {message:"NotCreator"},
  8: {message:"StillActive"},
  9: {message:"BadAmounts"},
  10: {message:"AlreadyInit"},
  11: {message:"NotInit"}
}


/**
 * Wire-compatible con el `Proof` del verificador generado
 * (a: G1 64B, b: G2 128B, c: G1 64B, ethereum-uncompressed).
 */
export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

export type DataKey = {tag: "Verifier", values: void} | {tag: "NextId", values: void} | {tag: "Chest", values: readonly [u64]} | {tag: "Nullifier", values: readonly [Buffer]};

export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  init: ({admin, verifier}: {admin: string, verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({chest_id, recipient, nullifier, proof}: {chest_id: u64, recipient: string, nullifier: Buffer, proof: Proof}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_chest: ({chest_id}: {chest_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Chest>>>

  /**
   * Construct and simulate a close_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  close_chest: ({chest_id}: {chest_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create_chest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_chest: ({creator, fingerprint, token, prize, max_claims, deadline}: {creator: string, fingerprint: Buffer, token: string, prize: i128, max_claims: u32, deadline: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABUNoZXN0AAAAAAAACAAAAAAAAAAGY2xhaW1zAAAAAAAEAAAAAAAAAAZjbG9zZWQAAAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAAAAAAAKbWF4X2NsYWltcwAAAAAABAAAAAAAAAAFcHJpemUAAAAAAAALAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAANQ2hlc3ROb3RGb3VuZAAAAAAAAAEAAAAAAAAAC0NoZXN0Q2xvc2VkAAAAAAIAAAAAAAAADENoZXN0RXhwaXJlZAAAAAMAAAAAAAAAB1NvbGRPdXQAAAAABAAAAAAAAAANTnVsbGlmaWVyVXNlZAAAAAAAAAUAAAAAAAAADEludmFsaWRQcm9vZgAAAAYAAAAAAAAACk5vdENyZWF0b3IAAAAAAAcAAAAAAAAAC1N0aWxsQWN0aXZlAAAAAAgAAAAAAAAACkJhZEFtb3VudHMAAAAAAAkAAAAAAAAAC0FscmVhZHlJbml0AAAAAAoAAAAAAAAAB05vdEluaXQAAAAACw==",
        "AAAAAQAAAHJXaXJlLWNvbXBhdGlibGUgY29uIGVsIGBQcm9vZmAgZGVsIHZlcmlmaWNhZG9yIGdlbmVyYWRvCihhOiBHMSA2NEIsIGI6IEcyIDEyOEIsIGM6IEcxIDY0QiwgZXRoZXJldW0tdW5jb21wcmVzc2VkKS4AAAAAAAAAAAAFUHJvb2YAAAAAAAADAAAAAAAAAAFhAAAAAAAD7gAAAEAAAAAAAAAAAWIAAAAAAAPuAAAAgAAAAAAAAAABYwAAAAAAA+4AAABA",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAACFZlcmlmaWVyAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAVDaGVzdAAAAAAAAAEAAAAGAAAAAQAAAAAAAAAJTnVsbGlmaWVyAAAAAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAEaW5pdAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAEAAAAAAAAAAhjaGVzdF9pZAAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2NoZXN0AAAAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAfQAAAABUNoZXN0AAAAAAAAAw==",
        "AAAAAAAAAAAAAAALY2xvc2VfY2hlc3QAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAAAAAAAMY3JlYXRlX2NoZXN0AAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAVwcml6ZQAAAAAAAAsAAAAAAAAACm1heF9jbGFpbXMAAAAAAAQAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAPpAAAABgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<Result<void>>,
        claim: this.txFromJSON<Result<void>>,
        get_chest: this.txFromJSON<Result<Chest>>,
        close_chest: this.txFromJSON<Result<i128>>,
        create_chest: this.txFromJSON<Result<u64>>
  }
}
/** Registry v2 (sets, constructor, token/deadline checks, group_id). The v1 `Client` above is unchanged. */
export { Client as ClientV2, Errors as ErrorsV2, networks as networksV2 } from "./v2.js";
export type { Chest as ChestV2, Proof as ProofV2 } from "./v2.js";
export {
  AUTH_VALID_LEDGERS,
  ClaimSimulationError,
  buildClaimTxWithAuth,
  checkClaimAuthEntry,
  claimArgsToScVals,
  prepareClaimAuth,
  sendAndWait,
  signClaimAuthEntry,
} from "./claim-auth.js";
export type { ClaimArgs, TxOpts as ClaimTxOpts } from "./claim-auth.js";
