/**
 * ChestZK SDK — puzzle chests on Stellar with address-bound ZK proofs.
 *
 * @example
 * ```ts
 * import { createChestClient, fingerprintAnswer, CONTRACTS, NETWORK } from "chestzk";
 *
 * const { fingerprintHex } = await fingerprintAnswer("8", 7n);
 * const client = createChestClient({
 *   rpcUrl: NETWORK.rpcUrl,
 *   networkPassphrase: NETWORK.passphrase,
 *   publicKey: creatorAddress,
 * });
 * // then client.create_chest({ … fingerprint, token: CONTRACTS.xlm, prize: 10_0000000n, … })
 * ```
 */
export { NETWORK, CONTRACTS, DEFAULT_AMOUNT_PER_SLOT_STROOPS } from "./config.js";
export { normalizeAnswer } from "./normalize.js";
export { answerToField, poseidon2, fieldToHex, fingerprintAnswer, } from "./fingerprint.js";
export { createChestClient, networks } from "./client.js";
