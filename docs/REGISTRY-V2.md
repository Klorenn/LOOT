# Registry v2

Contract: `contracts/chest`. Circuit, zkey and verifier are unchanged. The contract is immutable (no upgrade, no admin change): any future change means a new deployment.

## Verifier ids: which is which

- `CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY` = **MAINNET** ceremony verifier.
- `CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV` = **TESTNET** ceremony verifier.

Both run the same wasm (sha256 `8df17eda...05b5`) and the same verifying key (`vk_fingerprint` `3889d2e9...070ef`), but they are different contracts on different networks. Never configure one network with the other's id.

## Public interface

```
__constructor(verifier: Address, token: Address)      // deploy-time only, atomic with deployment
verifier() -> Address            token() -> Address            version() -> u32 (= 2)

create_set(creator) -> u64                                    // set id, same counter as chest ids
create_chest(creator, fingerprint: BytesN<32>, token, prize: i128, max_claims: u32, deadline: u64) -> u64
create_chest_in_set(creator, set_id: u64, fingerprint, token, prize, max_claims, deadline) -> u64
claim(chest_id: u64, recipient: Address, nullifier: BytesN<32>, proof: Proof{a:BytesN<64>, b:BytesN<128>, c:BytesN<64>})
                                                              // recipient.require_auth(): the recipient signs
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
- One claim per address per group (see below), and the recipient must sign the claim (`require_auth`).

## One claim per address (and what it does NOT do)

`DataKey::Claimed(group_id, recipient)` is the AUTHORITATIVE double-claim guard, for every chest (a normal chest is its own group) and for sets. It is checked first: a second claim to the same recipient in the same group fails with `AlreadyClaimed` (#16), whatever nullifier it carries. That matters because the nullifier is `Poseidon(playerSecret, groupId)` and `playerSecret` is chosen client-side: one address can produce as many nullifiers as it likes. The nullifier stays a public input of the proof (it is in the circuit, which was NOT changed) and is still recorded, but only as a defensive check (`NullifierUsed`, #5, for an exact replay from another address).

`claim` calls `recipient.require_auth()`. The recipient's wallet signs the Soroban authorization entry of the call; a relayer can still build, pay for and submit the transaction. Without the recipient's signature the call fails (`Error(Auth, ...)`), even with a valid proof.

This is NOT sybil resistance. A person with N fresh addresses (and N player secrets) can still claim N times. It only stops the same address from claiming twice. Real sybil resistance needs an identity or cost mechanism outside this contract. No circuit, zkey or verifier change was made.

### Player-signed claims through the relayer (app)

`/api/claim` for a v2 chest is two calls:

1. `{..., phase: "prepare"}`: the relayer simulates `claim` (recording auth) and returns the recipient's unsigned auth entry (`authEntry`, base64 XDR) and `validUntilLedger` (about 5 minutes). Contract errors (#16 already claimed, #6 invalid proof, ...) come back here, before the player is asked to sign.
2. Same body plus `signedAuthEntry`: the relayer checks that the entry is an address credential for exactly `claim(chest_id, recipient, nullifier, proof)` on this registry with no sub-invocations, simulates in enforcing mode (the signature is verified), applies its fee cap, signs ONLY the envelope as fee payer and submits.

Relayer-side limits for v2 claims: both steps go through the persistent rate limit; the wallet-signed flow is refused on mainnet and for v1 chests before any RPC; the fee cap is 0.5 XLM (`RELAY_MAX_CLAIM_V2_FEE_STROOPS`; measured resource fee 895,284 stroops); and because `require_auth` runs a C-address recipient's own `__check_auth` inside the relayer-paid transaction, the relayer sponsors only G accounts and contracts whose wasm hash is the passkey-kit wallet (`WALLET_WASM_HASH`, read with `getLedgerEntries` on the instance). Other contract accounts get `recipient_not_supported` (they can still submit the claim themselves).

Signing: a demo G key signs locally; an external G wallet signs with Stellar Wallets Kit `signAuthEntry` (SEP-43); a passkey C wallet signs with passkey-kit `signAuthEntry` (one WebAuthn prompt). The SDK helpers are in `packages/chestzk-chest/src/claim-auth.ts` (`prepareClaimAuth`, `signClaimAuthEntry`, `checkClaimAuthEntry`, `buildClaimTxWithAuth`, `sendAndWait`). v1 chests (and so mainnet) keep the old one-call flow.

## Why the set cannot be griefed or replayed

- Set ids and chest ids come from one counter, so a set id never equals any chest id or any other set id. A creator cannot choose a group id, so cannot collide with another creator's chests or sets (which would let them pre-burn players' nullifiers).
- Only the set owner can add chests to a set (`NotSetOwner` otherwise).
- A proof made for chest A binds A's fingerprint as a public input. Chest B in the same set has a different fingerprint, so the proof fails there. If a creator reuses one fingerprint in two chests of a set, the same answer works on both, but the shared nullifier (and the Claimed key) still allow only one claim per player.

## Tests

- `cargo +1.91 test` in `contracts/chest`: 40 tests. 29 unit tests with a strict mock verifier (`set_expected`), 11 integration tests in `src/integration.rs`.
- Integration tests load the REAL ceremony verifier wasm (`fixtures/chestzk_verifier_ceremony.wasm`, sha256 `8df17eda...05b5`, built from `contracts/verifier-mainnet`) and REAL Groth16 proofs. They cover: claim on a normal chest (group id = chest id), claim on a set chest (proof carries the set id), rejection on a chest of another group, recipient binding, tampered nullifier, replay, SAME address with a second playerSecret (valid proof, new nullifier) -> `AlreadyClaimed`, a second address claiming once (sybil, documented as not preventable), and a valid proof without the recipient's signature -> auth failure.
- Unit tests also check that `claim` requires exactly one auth, from the recipient, for this exact call, and that another address authorizing it is refused.
- Fixture: `contracts/chest/fixtures/real_proof.json` (+ generated `src/fixture_real_proof.rs`). Regenerate with `node scripts/gen-real-proof-fixture.mjs` (needs `snarkjs` on PATH). It uses the existing ceremony `chest.wasm` and `chest_final.zkey` from `circuits/ceremony/release-2026-10-26/app/zk`; no setup is redone. The proofs are for dummy inputs (answer, salt and secrets are placeholders, never a real chest answer) with `chestId = 1` and dummy contract-address recipients.
- `contracts/normal-chest`: 11 tests.
- Testnet e2e: `app/scripts/e2e-claim-auth.mjs` (create chest, claim with the player's signature and the relayer paying the fee, refusal of a claim signed by someone else, second claim from the same address with a new playerSecret -> #16).

## Deploy (mainnet)

`scripts/mainnet/deploy-registry.sh` is dry-run by default and does NOT redeploy the verifier. Before and after it checks that:

- the verifier is the ceremony verifier `CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY` (other ids are refused);
- its on-chain `vk_fingerprint()` equals `vk_sha256` in `contracts/verifier-mainnet/verifier-manifest.json` (`3889d2e9...070ef`; the verifier exposes `vk_fingerprint()`, so there is no gap);
- its on-chain wasm sha256 equals the ceremony release `8df17eda...05b5`;
- after deploy: registry `verifier()`, `token()` (native SAC `CAS3J7GY...XOWMA`) and `version()` match, otherwise it stops.

It writes `deployments/registry-v2-mainnet.json` (the v1 record `registry-mainnet.json` is never touched). `scripts/mainnet/verify-registry.mjs` understands `version: 2` records.

## Size and cost

- Wasm (with `require_auth` on claim): 13,547 bytes (`stellar contract build`, rustc 1.91), sha256 `88b24f3915e6d8f2a8f6fa63e6fec1392560020dd7bf6b0ed640877fbd462a7f`. The previous build without it was 13,386 bytes, sha256 `af9dc67a...c399` (deployed only as the old testnet registry `CAEBFT22...`).
- MAINNET simulation (dry-run of the script, read-only, `simulateTransaction`): upload about 18.82 XLM, deploy instance with constructor about 0.5 XLM (estimate; cannot be simulated before the wasm exists), total about 19.3 XLM. That is above the 14 XLM budget line the script carries for the registry upload (the old v1 wasm was smaller; mainnet upload rent is driven by wasm size). The verifier is already deployed, so its upload cost is not repeated.
- Per chest and per claim, the new TTL extensions add a few small persistent entries held at the max TTL (Nullifier, Claimed): rent for tiny entries, a fraction of a stroop-scale fee compared with the upload.

## Testnet deployment (throwaway identity)

- Identity `loot-v2-throwaway` (testnet only): `GADNYHTC5RSY4WGE2NOMNPKNQ3EDVL7Q4NPKIUEHGUW55DXT6ND5I2PP`.
- TESTNET ceremony verifier (wasm `8df17eda...`, vk `3889d2e9...`): `CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV`.
- Registry v2 (current, claim needs the recipient's signature): `CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG`, wasm sha256 `88b24f39...2a7f`, token = testnet native SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. Deploy tx `499e7d89...2849`. Record: `deployments/registry-v2-testnet.json`.
- Old registry `NextId` read on-chain on 2026-10-28: 11 (ids 1 to 10 used), so burning 1 to 20 covers every old metadata key.
- Ids 1 to 20 of the new registry were burned with `create_set` right after deploy. The app keys off-chain metadata (chests, sets, set claim markers) by ref = `1e9 + id`, and the previous registry used ids 1 to 10: without the burn, new chest 1 would inherit the old chest 1's question and salt. A later fix is to namespace v2 metadata by registry id.
- Previous registry v2 (superseded, no claim auth): `CAEBFT22DIJNNJ6CLHY5L3SKLSACRHJLJW22VQAKTI3MCCP5KTO277NJ`. Its chests are not migrated; once the app points to the new registry they are no longer listed.
- App env (testnet): `NEXT_PUBLIC_REGISTRY_V2_ID=CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG`, `NEXT_PUBLIC_VERIFIER_V2_ID=CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV`.

## Migration

- New contract address. The old mainnet registry (`CCMMITTW...`) keeps its chests; they are not migrated. The app must read both registries, or old chests must be closed by their creators.

## App changes needed

- Deadlines are mandatory: send `now < deadline <= now + 90 days` (seconds). `0` fails with `BadDeadline`.
- Token must be the registry token (`token()` getter or env). Anything else fails with `WrongToken`.
- Sets: call `create_set`, then `create_chest_in_set` for each chest; store the set id.
- Proving and claiming: use `chest.group_id` (from `get_chest`) as the circuit `chestId` input, not the chest id. For normal chests `group_id == chest id`, so reading `group_id` always works.
- The `Chest` struct gained `group_id`; update client decoding. New errors `WrongToken`, `BadDeadline`, `AlreadyClaimed` should map to user messages. `init` no longer exists; deployment passes `--verifier` and `--token`.
- A claim to an address that already claimed in the same chest/set fails with `AlreadyClaimed`; show that instead of a generic failure.
- Claims need the recipient's signature on the auth entry (see "Player-signed claims through the relayer"). Wallets without SEP-43 `signAuthEntry` (for example Rabet, LOBSTR in the kit) cannot claim v2 chests.

## `contracts/normal-chest`

Testnet demo only: it is the intentionally insecure counterpart (the answer travels in clear). It now has `__constructor(token)` and a `token()` getter, and escrow per chest is capped at 1,000 XLM (`MAX_TOTAL`, error `TooLarge=8`) as a cheap guard. Never deploy it to mainnet.
