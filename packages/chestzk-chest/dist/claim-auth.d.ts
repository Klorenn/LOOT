/**
 * Player-signed claims for registry v2 (`claim` calls `recipient.require_auth()`).
 *
 * The relayer still builds, pays for and submits the transaction (it is the tx source), but the
 * recipient's wallet must sign the Soroban authorization entry of the `claim` call. Flow:
 *
 *   1. relayer: `prepareClaimAuth` simulates `claim` (recording auth) and returns the unsigned entry
 *   2. player:  signs that entry with its wallet (`signClaimAuthEntry` for a G key / SEP-43 wallet,
 *               or passkey-kit `signAuthEntry` for a C smart wallet)
 *   3. relayer: `checkClaimAuthEntry` (it must authorize exactly this claim for this recipient), then
 *               `buildClaimTxWithAuth` (enforcing simulation) -> sign as fee payer -> `sendAndWait`
 *
 * None of this stops one person from using several addresses (sybil): the contract only stops the SAME
 * address from claiming twice in a group.
 */
import { Buffer } from "buffer";
import { Keypair, xdr, type SigningCallback, type Transaction } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
export type ClaimArgs = {
    chestId: bigint;
    recipient: string;
    nullifier: Buffer | Uint8Array;
    proof: {
        a: Buffer | Uint8Array;
        b: Buffer | Uint8Array;
        c: Buffer | Uint8Array;
    };
};
/** `claim(chest_id: u64, recipient: Address, nullifier: BytesN<32>, proof: Proof)` as ScVals. */
export declare function claimArgsToScVals(a: ClaimArgs): xdr.ScVal[];
export type TxOpts = {
    networkPassphrase: string;
    contractId: string;
    /** Fee payer / tx source (the relayer's G address). */
    source: string;
    args: ClaimArgs;
    /** Inclusion fee in stroops (resource fee is added from the simulation). */
    fee?: string;
    timeoutInSeconds?: number;
};
/** A simulation error carries the contract code as "Error(Contract, #N)" in its message. */
export declare class ClaimSimulationError extends Error {
}
/** Default signature lifetime: ~60 ledgers (about 5 minutes). */
export declare const AUTH_VALID_LEDGERS = 60;
/**
 * Simulate `claim` with the relayer as source and return the recipient's UNSIGNED auth entry (base64 XDR).
 * Fails with ClaimSimulationError when the contract would reject the claim (e.g. #16 already claimed,
 * #6 invalid proof), so the player is not asked to sign a claim that cannot land.
 */
export declare function prepareClaimAuth(server: Server, o: TxOpts): Promise<{
    authEntry: string;
    latestLedger: number;
    validUntilLedger: number;
}>;
/**
 * Sign the claim auth entry. `signer` is a Keypair (demo key) or a callback that signs the preimage
 * (a SEP-43 wallet's `signAuthEntry(preimage.toXDR("base64"))`, returning the signature bytes).
 */
export declare function signClaimAuthEntry(authEntryXdr: string, signer: Keypair | SigningCallback, validUntilLedger: number, networkPassphrase: string): Promise<string>;
/**
 * Relayer-side check of a (signed) entry: it must be an address credential for `recipient` that
 * authorizes exactly `contractId.claim(args)` and nothing else (no sub-invocations).
 * Returns the parsed entry. Throws on anything else.
 */
export declare function checkClaimAuthEntry(authEntryXdr: string, o: {
    contractId: string;
    args: ClaimArgs;
    currentLedger?: number;
}): xdr.SorobanAuthorizationEntry;
/**
 * Build the final claim tx carrying the player's signed auth entry, simulate it in ENFORCING mode
 * (the signature is checked) and assemble it. Unsigned: the relayer signs it as fee payer.
 * `resourceFee` is the simulated resource fee in stroops; total fee = inclusion + resourceFee.
 */
export declare function buildClaimTxWithAuth(server: Server, o: TxOpts & {
    auth: xdr.SorobanAuthorizationEntry;
    instructionLeeway?: number;
}): Promise<{
    tx: Transaction;
    resourceFee: bigint;
}>;
/** Submit a signed tx and wait for the result. Throws "TRY_AGAIN_LATER" so callers can bump the fee. */
export declare function sendAndWait(server: Server, tx: Transaction, timeoutMs?: number): Promise<{
    hash: string;
    ledger: number | null;
    status: string;
}>;
