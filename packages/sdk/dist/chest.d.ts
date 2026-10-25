import { NETWORK } from "./config.js";
import { type ChainOpts, type Signer } from "./chain.js";
import { type CircuitArtifacts } from "./zk.js";
export type SdkOpts = ChainOpts & {
    /** Override the factory address (default: CONTRACTS.factory). */
    factory?: string;
};
export type FactoryConfig = {
    admin: string;
    treasury: string;
    chestWasmHash: string;
    verifier: string;
    token: string;
    creationFee: bigint;
    dailyFeeBps: number;
    maxDurationDays: number;
};
export declare function getFactoryConfig(o?: SdkOpts): Promise<FactoryConfig>;
export type CreateQuote = {
    /** per-place amounts in claim order (1st, 2nd, ...) */
    places: {
        place: number;
        amountXlm: string;
    }[];
    /** sum of all places, locked in the chest (fees never touch it) */
    prizeXlm: string;
    creationFeeXlm: string;
    /** EXACT prepaid reserve = prize x dailyFeeBps/10000 x days; the unused part is refunded on close */
    feeReserveXlm: string;
    /** network fee estimate from simulation (resource fee + inclusion), or a fallback */
    networkEstimateXlm: string;
    networkEstimateFromSimulation: boolean;
    /** prize + creation fee + fee reserve + network estimate */
    totalXlm: string;
    dailyFeeBps: number;
    durationDays: number;
};
/**
 * Prizes: give EITHER `prizesXlm` (one amount per place, in claim order: [50, 20, 10] =
 * 1st/2nd/3rd) OR `amountPerSlotXlm` + `slots` (equal prizes). Places are claim order: whoever
 * proves first gets the first amount.
 */
export type PrizeSpec = {
    prizesXlm?: (number | string)[];
    amountPerSlotXlm?: number | string;
    slots?: number;
};
export type CreateParams = PrizeSpec & {
    question: string;
    answer: string;
    durationDays: number;
};
export declare const MAX_PLACES = 50;
/** Resolve a PrizeSpec to stroop tiers; validates 1..50 places and every amount > 0. */
export declare function resolvePrizes(p: PrizeSpec): bigint[];
/**
 * Breakdown to show BEFORE signing. Pass `creator` (the G… that will pay) to get a
 * simulated network cost; without it a conservative fallback is used.
 */
export declare function quoteCreate(p: Omit<CreateParams, "question" | "answer"> & {
    question?: string;
    answer?: string;
    creator?: string;
}, o?: SdkOpts): Promise<CreateQuote>;
export declare function createChest(p: CreateParams & {
    signer: Signer;
} & SdkOpts): Promise<{
    chestAddress: string;
    txHash: string;
    fingerprintHex: string;
}>;
/**
 * Same as createChest but with a precomputed fingerprint (hex), so the answer never
 * leaves the browser when a server signs/submits the transaction.
 */
export declare function createChestFromFingerprint(p: Omit<CreateParams, "answer"> & {
    fingerprintHex: string;
    signer: Signer;
} & SdkOpts): Promise<{
    chestAddress: string;
    txHash: string;
    fingerprintHex: string;
}>;
export type Chest = {
    address: string;
    creator: string;
    question: string;
    fingerprintHex: string;
    token: string;
    treasury: string;
    verifier: string;
    /** prize schedule in claim order (stroops) and the same in XLM */
    prizes: bigint[];
    prizesXlm: string[];
    /** number of places */
    slots: number;
    /** claims so far (== next place, 0-based) */
    claims: number;
    slotsLeft: number;
    /** next place to be paid ("Next prize: 2nd place, 20 XLM"), null when sold out or closed */
    nextPlace: {
        place: number;
        amountXlm: string;
        amount: bigint;
    } | null;
    expiry: Date;
    lastFeeTs: number;
    dailyFeeBps: number;
    closed: boolean;
    expired: boolean;
    /** live token balance of the chest (stroops) */
    balance: bigint;
    balanceXlm: string;
    /** unclaimed prize (stroops); fees never touch it */
    prizePool: bigint;
    /** prepaid fees not yet charged (stroops); unused part is refunded on close */
    feeReserve: bigint;
};
export declare function getChest(address: string, o?: ChainOpts): Promise<Chest>;
/** All chest contract addresses created by the factory (oldest first). */
export declare function listChests(o?: SdkOpts): Promise<string[]>;
export type ClaimParams = {
    chestAddress: string;
    answer: string;
    /** G… or C… that receives the prize (bound into the proof). */
    recipient: string;
    /** Pays the tx fee. For gasless/passkey flows give a relayer-backed signer with `submit`. */
    signer: Signer;
    /**
     * Secret behind the nullifier (nullifier = Poseidon(playerSecret, chestId)).
     * Default: a fresh random secret, returned by `claim` so the caller can store it.
     * NOTE: the circuit does not bind playerSecret to the recipient, so this does NOT
     * limit claims per person: anyone who knows the answer can claim several slots with
     * different secrets. The nullifier only stops replaying the same proof.
     */
    playerSecret?: bigint;
    /** Legacy chests only: override the salt (default derives from the question). */
    salt?: bigint;
    circuit?: CircuitArtifacts;
} & SdkOpts;
/** Random 248-bit secret (fits the BN254 field). Keep it if you need to prove the same nullifier again. */
export declare function randomPlayerSecret(): bigint;
export declare class WrongAnswerError extends Error {
    constructor();
}
/**
 * Generates the Groth16 proof client-side and submits `claim`.
 * The winner always receives exactly amount_per_slot (fees come from the reserve only).
 */
export declare function claim(p: ClaimParams): Promise<{
    txHash: string;
    nullifierHex: string;
    playerSecret: bigint;
}>;
/**
 * Submit an already generated proof (e.g. a server relayer receiving it from the browser).
 * The recipient signs nothing; `signer` only pays the fee.
 */
export declare function submitClaim(p: {
    chestAddress: string;
    recipient: string;
    nullifierHex: string;
    proof: {
        a: string;
        b: string;
        c: string;
    };
    signer: Signer;
} & ChainOpts): Promise<{
    txHash: string;
}>;
/** Creator only. Charges due fees and refunds the remaining balance to the creator. */
export declare function close(p: {
    chestAddress: string;
    signer: Signer;
} & ChainOpts): Promise<{
    txHash: string;
    refundedStroops: bigint;
    refundedXlm: string;
}>;
/** Public: charge the daily fees already due (anyone can call). */
export declare function accrueFees(p: {
    chestAddress: string;
    signer: Signer;
} & ChainOpts): Promise<{
    txHash: string;
    feeStroops: bigint;
}>;
export { NETWORK };
