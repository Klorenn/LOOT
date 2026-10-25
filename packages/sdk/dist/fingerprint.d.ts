/** Encode answer text/number to BN254 field element (same as the app). */
export declare function answerToField(answer: string): bigint;
export declare function poseidon2(a: bigint, b: bigint): Promise<bigint>;
export declare function fieldToHex(fe: bigint | string): string;
/**
 * Fingerprint = Poseidon(answerField, salt).
 * Normalizes the answer first (trim, lower, no accents/spaces).
 */
export declare function fingerprintAnswer(answer: string, salt: bigint | string): Promise<{
    fingerprintHex: string;
    normalized: string;
}>;
