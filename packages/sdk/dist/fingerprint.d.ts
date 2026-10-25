/** Encode answer text/number to BN254 field element (same as the app). */
export declare function answerToField(answer: string): bigint;
export declare function poseidon2(a: bigint, b: bigint): Promise<bigint>;
export declare function fieldToHex(fe: bigint | string): string;
/**
 * Field element of a Stellar address (G… or C…):
 * sha256(xdr(ScVal Address)) with byte[0]=0. Matches `field_from_address` in the
 * contracts. Used for both the `recipient` and the `chestId` public inputs
 * (for a per-chest contract, chestId = field of the chest contract address).
 */
export declare function addressField(address: string): {
    hex: string;
    decimal: string;
};
/**
 * Salt of a factory chest. The factory's create_chest has no salt parameter, so the
 * salt is derived from the (public, on-chain) question: sha256(utf8) with byte[0]=0.
 * Legacy registry chests used a random salt kept off-chain; pass it explicitly there.
 */
export declare function saltFromQuestion(question: string): bigint;
/**
 * Fingerprint = Poseidon(answerField, salt).
 * Normalizes the answer first (trim, lower, strip accents and spaces).
 */
export declare function fingerprintAnswer(answer: string, salt: bigint | string): Promise<{
    fingerprintHex: string;
    normalized: string;
}>;
