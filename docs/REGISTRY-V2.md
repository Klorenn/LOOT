# Registry v2

Contract: `contracts/chest`. Circuit and verifier are unchanged.

## What changed

- `create_set(creator) -> set_id`: allocates a set id from the same counter as chest ids.
- `create_chest_in_set(creator, set_id, ...)`: same as `create_chest`, but the chest joins the set. Only the set's creator can add chests.
- `Chest` has a new field `group_id`. For a normal chest `group_id == chest id` (behavior identical to v1). For a set chest it is the set id.
- `claim` pushes `group_id` (not the chest id) as the `chestId` public input. The nullifier is `Poseidon(playerSecret, groupId)`, so it is shared by every chest in a set: one claim per account per set. The `Nullifier(n)` storage key still blocks double spend.
- `version()` getter returns `2`.
- New errors: `NotSetOwner = 12`, `SetNotFound = 13`.

The contract is immutable (no upgrade, no admin change). Any future change means a new deployment.

## Why the set cannot be griefed or replayed

- Set ids and chest ids come from one counter, so a set id never equals any chest id or any other set id. A creator cannot choose a group id, so cannot collide with another creator's chests or sets (which would let them pre-burn players' nullifiers).
- Only the set owner can add chests to a set (`NotSetOwner` otherwise).
- A proof made for chest A binds A's fingerprint as a public input. Chest B in the same set has a different fingerprint, so the proof fails there (tests use a strict mock verifier that compares the full public-inputs vector). If a creator reuses one fingerprint in two chests of a set, the same answer works on both, but the shared nullifier still allows only one claim.
- Limit: "account" means the player secret. Someone with two secrets gets two nullifiers, same as v1.

## Migration

- New contract address. The old mainnet registry (`CCMMITTW...`) keeps its chests; they are not migrated. The app must read both registries, or old chests must be closed by their creators.

## App changes needed

- Sets: call `create_set`, then `create_chest_in_set` for each chest; store the set id.
- Proving and claiming a set chest: use `chest.group_id` (from `get_chest`) as the circuit `chestId` input, not the chest id. For normal chests `group_id == chest id`, so reading `group_id` always works.
- The `Chest` struct gained `group_id`; update client decoding.
- `init` is still a separate tx after deploy (front-run window, as in v1). Init immediately and verify the stored verifier.

## Size and cost

- Wasm: 11,307 bytes (`stellar contract build`), sha256 `81795271e5e43ecbef60e4dd5699596ac0661ac2fb7631471d7016fc8e15b0ca`.
- TESTNET measurements: upload fee charged 8,596,322 stroops (about 0.86 XLM, after a 1.29M refund); deploy instance 14,864 stroops (about 0.0015 XLM). Testnet rent pricing differs from mainnet; run `scripts/mainnet/deploy-registry.sh` (dry-run) with `WASM_DIR` set for the mainnet simulation. That script budgets 14 XLM for the registry upload, so v2 should come in well under.
