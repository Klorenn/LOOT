# Registry v2

Contract: `contracts/chest`. Circuit, zkey and verifier are unchanged. The contract is immutable (no upgrade, no admin change): any future change means a new deployment.

## Public interface

```
__constructor(verifier: Address, token: Address)      // deploy-time only, atomic with deployment
verifier() -> Address            token() -> Address            version() -> u32 (= 2)

create_set(creator) -> u64                                    // set id, same counter as chest ids
create_chest(creator, fingerprint: BytesN<32>, token, prize: i128, max_claims: u32, deadline: u64) -> u64
create_chest_in_set(creator, set_id: u64, fingerprint, token, prize, max_claims, deadline) -> u64
claim(chest_id: u64, recipient: Address, nullifier: BytesN<32>, proof: Proof{a:BytesN<64>, b:BytesN<128>, c:BytesN<64>})
close_chest(chest_id: u64) -> i128                            // creator only; refunds the unclaimed remainder
get_chest(chest_id: u64) -> Chest

struct Chest { creator, fingerprint, token, prize: i128, max_claims: u32, claims: u32,
               deadline: u64, closed: bool, group_id: u64 }
```

`init` and `AlreadyInit`/`NotInit` are gone. `create_chest` and `create_chest_in_set` keep the `token` parameter (so clients do not change) but it must equal the registry token.

Errors: `ChestNotFound=1, ChestClosed=2, ChestExpired=3, SoldOut=4, NullifierUsed=5, InvalidProof=6, NotCreator=7, StillActive=8, BadAmounts=9, NotSetOwner=12, SetNotFound=13, WrongToken=14, BadDeadline=15, AlreadyClaimed=16`. Codes 10 and 11 (old init errors) are retired, not reused.

Circuit public input order is unchanged: `[fingerprint, nullifier, chestId, recipient]`, where `chestId` is `Chest.group_id`.

## What changed in v2

- Sets: `create_set`, `create_chest_in_set`, `Chest.group_id`. A normal chest has `group_id == chest id`; a set chest has the set id. `claim` pushes `group_id` as the `chestId` public input, so the nullifier `Poseidon(playerSecret, groupId)` is shared across a set.
- Constructor `__constructor(verifier, token)` replaces `init`. Deploy and initialisation are one transaction, so nobody can front-run an init and install their own verifier.
- Token is fixed to the registry token (XLM SAC on mainnet). Any other token is rejected with `WrongToken`.
- Deadline must satisfy `now < deadline <= now + MAX_DEADLINE`, with `MAX_DEADLINE = 90 days`. `0` ("never expires") is rejected with `BadDeadline`.
- `close_chest` writes `closed = true` before the token transfer (checks-effects-interactions).
- TTL: `create_chest` and `claim` extend the instance and the Chest entry past the deadline plus a 30-day close grace (clamped to the network max TTL; ledger time assumed 4 s so it over-extends). Nullifier, Claimed and SetOwner entries are extended to the network max TTL.
- One claim per address per group (see below).

## One claim per address (and what it does NOT do)

`DataKey::Claimed(group_id, recipient)` is set on every claim. A second claim to the same recipient in the same group fails with `AlreadyClaimed`: the same chest, or two chests of one set. The existing nullifier check still runs first (same player secret gives `NullifierUsed`).

This is NOT sybil resistance. A person with N fresh addresses (and N player secrets) can still claim N times. It only stops the same address from claiming twice, which the nullifier alone did not (a new player secret gave a new nullifier). Real sybil resistance needs an identity or cost mechanism outside this contract. No circuit, zkey or verifier change was made.

## Why the set cannot be griefed or replayed

- Set ids and chest ids come from one counter, so a set id never equals any chest id or any other set id. A creator cannot choose a group id, so cannot collide with another creator's chests or sets (which would let them pre-burn players' nullifiers).
- Only the set owner can add chests to a set (`NotSetOwner` otherwise).
- A proof made for chest A binds A's fingerprint as a public input. Chest B in the same set has a different fingerprint, so the proof fails there. If a creator reuses one fingerprint in two chests of a set, the same answer works on both, but the shared nullifier (and the Claimed key) still allow only one claim per player.

## Tests

- `cargo +stable test` in `contracts/chest`: 33 tests. 26 unit tests with a strict mock verifier (`set_expected`), 7 integration tests in `src/integration.rs`.
- Integration tests load the REAL ceremony verifier wasm (`fixtures/chestzk_verifier_ceremony.wasm`, sha256 `8df17eda...05b5`, built from `contracts/verifier-mainnet`) and a REAL Groth16 proof. They cover: claim on a normal chest (group id = chest id), claim on a set chest (proof carries the set id), rejection on a chest of another group, recipient binding, tampered nullifier, replay.
- Fixture: `contracts/chest/fixtures/real_proof.json` (+ generated `src/fixture_real_proof.rs`). Regenerate with `node scripts/gen-real-proof-fixture.mjs` (needs `snarkjs` on PATH). It uses the existing ceremony `chest.wasm` and `chest_final.zkey` from `circuits/ceremony/release-2026-10-26/app/zk`; no setup is redone. The proof is for dummy inputs (answer, salt and secret are placeholders, never a real chest answer) with `chestId = 1` and a dummy contract-address recipient.
- `contracts/normal-chest`: 11 tests.

## Deploy (mainnet)

`scripts/mainnet/deploy-registry.sh` is dry-run by default and does NOT redeploy the verifier. Before and after it checks that:

- the verifier is the ceremony verifier `CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY` (other ids are refused);
- its on-chain `vk_fingerprint()` equals `vk_sha256` in `contracts/verifier-mainnet/verifier-manifest.json` (`3889d2e9...070ef`; the verifier exposes `vk_fingerprint()`, so there is no gap);
- its on-chain wasm sha256 equals the ceremony release `8df17eda...05b5`;
- after deploy: registry `verifier()`, `token()` (native SAC `CAS3J7GY...XOWMA`) and `version()` match, otherwise it stops.

It writes `deployments/registry-v2-mainnet.json` (the v1 record `registry-mainnet.json` is never touched). `scripts/mainnet/verify-registry.mjs` understands `version: 2` records.

## Size and cost

- Wasm: 13,386 bytes (`stellar contract build`), sha256 `af9dc67a2ddfd1b8884ad53b4afda9bcd5b58e9dcfa74ace15ab2927d9f0c399`. Larger than the 11,307 bytes of the first v2 (TTL logic, Claimed, token and deadline checks).
- MAINNET simulation (dry-run of the script, read-only, `simulateTransaction`): upload about 18.82 XLM, deploy instance with constructor about 0.5 XLM (estimate; cannot be simulated before the wasm exists), total about 19.3 XLM. That is above the 14 XLM budget line the script carries for the registry upload (the old v1 wasm was smaller; mainnet upload rent is driven by wasm size). The verifier is already deployed, so its upload cost is not repeated.
- Per chest and per claim, the new TTL extensions add a few small persistent entries held at the max TTL (Nullifier, Claimed): rent for tiny entries, a fraction of a stroop-scale fee compared with the upload.

## Testnet deployment (throwaway identity, for reference)

- Identity `loot-v2-throwaway` (testnet only): `GADNYHTC5RSY4WGE2NOMNPKNQ3EDVL7Q4NPKIUEHGUW55DXT6ND5I2PP`.
- Ceremony verifier (wasm `8df17eda...`): `CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV`.
- Registry v2: `CAEBFT22DIJNNJ6CLHY5L3SKLSACRHJLJW22VQAKTI3MCCP5KTO277NJ`, token = testnet native SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. `version()` = 2; `create_chest` with a valid deadline succeeded (chest 1).

## Migration

- New contract address. The old mainnet registry (`CCMMITTW...`) keeps its chests; they are not migrated. The app must read both registries, or old chests must be closed by their creators.

## App changes needed

- Deadlines are mandatory: send `now < deadline <= now + 90 days` (seconds). `0` fails with `BadDeadline`.
- Token must be the registry token (`token()` getter or env). Anything else fails with `WrongToken`.
- Sets: call `create_set`, then `create_chest_in_set` for each chest; store the set id.
- Proving and claiming: use `chest.group_id` (from `get_chest`) as the circuit `chestId` input, not the chest id. For normal chests `group_id == chest id`, so reading `group_id` always works.
- The `Chest` struct gained `group_id`; update client decoding. New errors `WrongToken`, `BadDeadline`, `AlreadyClaimed` should map to user messages. `init` no longer exists; deployment passes `--verifier` and `--token`.
- A claim to an address that already claimed in the same chest/set fails with `AlreadyClaimed`; show that instead of a generic failure.

## `contracts/normal-chest`

Testnet demo only: it is the intentionally insecure counterpart (the answer travels in clear). It now has `__constructor(token)` and a `token()` getter, and escrow per chest is capped at 1,000 XLM (`MAX_TOTAL`, error `TooLarge=8`) as a cheap guard. Never deploy it to mainnet.
