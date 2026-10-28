/**
 * Registry versions. Loot reads two registries at once: the original (v1) and, when configured, v2
 * (sets in the contract, token and deadline checks, one claim per address per group).
 *
 * Both registries count chests from 1, so a bare number is ambiguous. The app keeps ONE number per chest, a
 * "ref": v1 chests keep their plain id (so every existing link, code and stored record stays valid) and v2
 * chests are `V2_REF_OFFSET + id`. Everything keyed by chest id (metadata, sets, claim markers, URLs) keeps
 * working unchanged; only the code that talks to the chain splits a ref back into (version, id).
 *
 * Pure module (no I/O): safe on server and client, unit-tested.
 */
export type RegistryVersion = 1 | 2;

/** v1 ids are far below this (the live registries have a few dozen chests). */
export const V2_REF_OFFSET = 1_000_000_000;

export function refOf(version: RegistryVersion, id: number): number {
  if (!Number.isSafeInteger(id) || id < 0 || id >= V2_REF_OFFSET) throw new Error(`bad chest id ${id}`);
  return version === 2 ? V2_REF_OFFSET + id : id;
}

export function splitRef(ref: number): { version: RegistryVersion; id: number } {
  if (!Number.isSafeInteger(ref) || ref < 0) throw new Error(`bad chest ref ${ref}`);
  return ref >= V2_REF_OFFSET ? { version: 2, id: ref - V2_REF_OFFSET } : { version: 1, id: ref };
}

/** Number shown to people ("Chest #0007"): the on-chain id inside its registry. */
export const displayId = (ref: number): number => splitRef(ref).id;

export const isV2Ref = (ref: number): boolean => Number.isSafeInteger(ref) && ref >= V2_REF_OFFSET;

/** What the registry-aware code needs from the network config. */
export type RegistryIds = { chest: string; chestV2: string };

/** Contract that holds `ref`, with the on-chain id. Throws a ChestNotFound-style error when v2 is not configured. */
export function registryFor(ids: RegistryIds, ref: number): { version: RegistryVersion; contractId: string; id: number } {
  const { version, id } = splitRef(ref);
  const contractId = version === 2 ? ids.chestV2 : ids.chest;
  if (!contractId) throw new Error(`ChestNotFound: registry v${version} is not configured`);
  return { version, contractId, id };
}

/**
 * Circuit `chestId` public input for a claim: `Chest.group_id` on v2 (the set id for set chests), the chest id on
 * v1 (which has no group_id). The nullifier is Poseidon(playerSecret, this value) and is shared across a v2 set.
 */
export function groupIdOf(chest: { id: number; groupId?: number | null }): number {
  return chest.groupId ?? chest.id;
}

/**
 * Decimal string for the circuit `chestId` input of a claim on `ref`. v2 REQUIRES the on-chain `group_id` (null =
 * not read yet: the caller must stop, guessing the chest id would be wrong for set chests). v1 has none: its id.
 */
export function circuitChestId(ref: number, groupId: number | null | undefined): string | null {
  const { version, id } = splitRef(ref);
  if (version === 2) return groupId === undefined || groupId === null ? null : String(groupId);
  return String(id);
}

/**
 * Zkey by registry version AND network. The ceremony zkey (the one the ceremony verifier was built from)
 * protects mainnet and every v2 registry; only the original v1 testnet registry still uses the old zkey.
 */
export function usesCeremonyZkey(mainnet: boolean, version: RegistryVersion): boolean {
  return mainnet || version === 2;
}

// ---------- deadline (mirrors the v2 contract: now < deadline <= now + MAX_DEADLINE) ----------

export const MAX_DEADLINE_SECS = 90 * 24 * 3600;

/** null when the deadline is acceptable for the registry; otherwise a plain English message. */
export function deadlineError(deadline: number, nowSec: number = Math.floor(Date.now() / 1000)): string | null {
  if (!Number.isSafeInteger(deadline) || deadline <= nowSec)
    return "The chest needs an expiry in the future; otherwise the prize could never be recovered.";
  if (deadline > nowSec + MAX_DEADLINE_SECS) return "The expiry can be at most 90 days from now.";
  return null;
}

// ---------- contract errors -> user messages ----------

export const ALREADY_CLAIMED_MSG = "This address already claimed from this chest/set.";

const CONTRACT_MESSAGES: Record<number, string> = {
  1: "This chest doesn’t exist.",
  2: "This chest is closed.",
  3: "This chest has expired.",
  4: "All the prizes of this chest were already claimed.",
  5: "This proof was already used to claim.",
  6: "The proof was rejected. Check your answer and try again.",
  7: "Only the creator of this chest can do that.",
  8: "This chest is still active. It can be closed after it expires.",
  9: "The prize or number of claims is not valid.",
  12: "Only the owner of this set can add chests to it.",
  13: "This set doesn’t exist.",
  14: "This registry only pays its own token (XLM). Other tokens are not accepted.",
  15: "The expiry must be in the future and at most 90 days from now.",
  16: ALREADY_CLAIMED_MSG,
};

/** `Error(Contract, #N)` in any thrown value or string, or null. */
export function contractErrorCode(e: unknown): number | null {
  const m = (e instanceof Error ? e.message : String(e)).match(/Error\(Contract,\s*#(\d+)\)/);
  return m ? Number(m[1]) : null;
}

/** Clear English message for a registry error code, or null if the code is not a known one. */
export function contractErrorMessage(code: number | null): string | null {
  return code !== null && code in CONTRACT_MESSAGES ? CONTRACT_MESSAGES[code] : null;
}

// ---------- set membership (server-side check of a chest declared as question `index` of a set) ----------

/**
 * Which set id (a ref) a chest belongs to, checked against the chain. `declaredSetId` is what the creator said at
 * reserve time (0 for question 1 on registry v1, where the set id is the chest id of question 1).
 *  - v1 chest: the off-chain rule, unchanged (question 1 is the set; later questions name it).
 *  - v2 chest: the set MUST be an on-chain set (create_set) and the chest's `group_id` must be that set's id, so
 *    nobody can attach a chest to a set it does not belong to. `groupId` is the chest's local group_id.
 */
export function resolveSetId(i: {
  chestRef: number;
  groupId: number;
  declaredSetId: number;
  index: number;
}): { setId: number } | { error: string } {
  const chest = splitRef(i.chestRef);
  if (chest.version === 1) {
    if (isV2Ref(i.declaredSetId)) return { error: "this chest is not part of that set" };
    return { setId: i.index === 0 ? i.chestRef : i.declaredSetId };
  }
  if (!isV2Ref(i.declaredSetId)) return { error: "a set on registry v2 must be created on-chain with create_set" };
  if (i.groupId !== splitRef(i.declaredSetId).id || i.groupId === chest.id)
    return { error: "this chest is not part of that on-chain set" };
  return { setId: i.declaredSetId };
}

/** Contract method that creates a chest: `create_chest_in_set` only for a registry-v2 set; throws on a registry mismatch. */
export function createMethod(version: RegistryVersion, setRef?: number): "create_chest" | "create_chest_in_set" {
  if (setRef === undefined) return "create_chest";
  if (version !== 2) throw new Error("Sets inside the contract need registry v2.");
  if (!isV2Ref(setRef)) throw new Error("That set belongs to a different registry.");
  return "create_chest_in_set";
}
