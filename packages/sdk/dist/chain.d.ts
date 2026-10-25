import { Keypair, Transaction, rpc, xdr } from "@stellar/stellar-sdk";
export type Signer = {
    /** G… account used as transaction source / fee payer (and creator auth for G wallets). */
    publicKey: string;
    /** Signs a transaction (or fee-bump) XDR and returns the signed XDR. */
    signTransaction(xdr: string): Promise<string>;
    /**
     * Optional: submit the signed XDR through a relayer (OZ Channels, fee-bump…)
     * instead of RPC. Must resolve with the tx hash.
     */
    submit?(signedXdr: string): Promise<string>;
};
export type ChainOpts = {
    rpcUrl?: string;
    networkPassphrase?: string;
};
export declare function keypairSigner(kp: Keypair | string, opts?: ChainOpts): Signer;
export declare function getRpc(opts?: ChainOpts): rpc.Server;
export type SimResult = {
    retval: unknown;
    scVal: xdr.ScVal | undefined;
    sim: rpc.Api.SimulateTransactionSuccessResponse;
    tx: Transaction;
};
/** Simulate a contract call (read, or pre-flight for a write). */
export declare function simulate(contractId: string, method: string, args: xdr.ScVal[], opts?: ChainOpts & {
    source?: string;
    cpuInstructions?: number;
}): Promise<SimResult>;
export declare function read<T = unknown>(contractId: string, method: string, args?: xdr.ScVal[], opts?: ChainOpts): Promise<T>;
export type InvokeResult = {
    hash: string;
    returnValue: unknown;
    feeStroops: bigint;
};
/** Simulate, assemble, sign, submit and wait for a contract call. */
export declare function invoke(contractId: string, method: string, args: xdr.ScVal[], signer: Signer, opts?: ChainOpts & {
    cpuInstructions?: number;
}): Promise<InvokeResult>;
