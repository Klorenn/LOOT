# Multi-party Groth16 phase-2 ceremony: plan

Status: plan only. No ceremony has been run under this plan. The current zkey
(`circuits/ceremony/release-2026-10-26`) came from ONE human contributor plus a Stellar ledger beacon that was
chosen privately, not announced in advance (see its `TRANSCRIPT.md`). That is fine for testnet. It is not enough
for an open launch: if that one contributor kept their entropy, they could forge proofs and drain any chest.

## Goal

Produce a new `chest_final.zkey` and verifying key for the UNCHANGED circuit (`circuits/chest.circom`, r1cs sha256
`c7696685...03d2`) so that proofs stay sound as long as **at least one** participant destroyed their toxic waste.
The final step uses a random beacon that **nobody can choose or predict**, and the beacon source is published before
the ceremony starts.

Out of scope: phase 1. We keep the public Hermez `powersOfTau28_hez_final_12.ptau` (54 contributions, blake2b
`ded26941...8a4a`, the value published in the snarkjs README). Every participant re-checks that hash.

## Roles

- **Coordinator** (Loot team): publishes the plan and the initial zkey, passes the zkey from one participant to the
  next, publishes every intermediate file and hash. The coordinator is trusted for liveness, NOT for soundness:
  everything they publish can be checked.
- **Participants**: each runs one `snarkjs zkey contribute` on their own machine and publishes their contribution hash.
- **Verifiers**: anyone. They rerun the checks in "Verification" from the public files only.

## Participant list

1. Open call, posted publicly (repo issue, X, the Stellar dev Discord) at least **14 days** before the window opens.
   It states the dates, the beacon rule and the hardware/time needed (about 5 minutes, any laptop, snarkjs 0.7.6).
2. Target: **at least 8 contributors**, with at least **5 who are not on the Loot team** and come from different
   organizations (other Stellar/Soroban teams, auditors, community members). No upper bound beyond what the window
   allows.
3. Each participant registers a public identity (GitHub or X handle) and a contact. The ordered list is published
   before the window opens and frozen when the window opens. Late joiners go to the end only if time allows.
4. Each participant signs (GitHub-verified commit or a signed message from their handle) a short statement after
   contributing: their contribution hash, the snarkjs version, and that they deleted their entropy.
5. A participant who goes silent for 24 hours is skipped; the next one continues from the last published zkey.

## Procedure

1. **Freeze inputs.** Publish: r1cs sha256, circuit wasm sha256, ptau URL and blake2b, snarkjs version, the commit of
   `circuits/`. Generate `chest_0000.zkey` with `snarkjs groth16 setup` (deterministic; anyone can reproduce it and
   must get the same sha256).
2. **Announce the beacon (before contribution 1).** Publish, in the same signed announcement:
   - Primary: **drand mainnet (League of Entropy, default chain)** round `R`, where `R` is the first round whose time
     is at least 24 hours after the scheduled close of the contribution window. The round number and its expected
     UTC time are stated explicitly.
   - Cross-check: the **Stellar mainnet ledger** with sequence `L`, chosen as the first ledger expected to close at
     least 24 hours after the window closes (sequence stated explicitly, using the ~5 s ledger time).
   - The beacon value is `sha256(drand_randomness(R) || stellar_ledger_hash(L))`, hex. Mixing two independent
     sources means neither the drand network nor Stellar validators alone can steer it, and both are publicly
     checkable after the fact.
   - Iterations: `2^10` for `snarkjs zkey beacon`, as before.
3. **Contributions.** In list order, participant `i` downloads `chest_{i-1}.zkey`, checks its sha256 against the
   published value, runs `snarkjs zkey verify` on it, then runs
   `snarkjs zkey contribute chest_{i-1}.zkey chest_i.zkey --name="<handle>"` with entropy typed and generated on
   their machine (never sent anywhere). They upload `chest_i.zkey`, post its sha256 and the contribution hash
   printed by snarkjs, then delete the entropy and any local copies they do not need.
4. **Close.** The window closes at the announced time. The last published zkey is final input to the beacon.
   No contribution is accepted after the close, even if the beacon round has not arrived yet.
5. **Beacon.** Once drand round `R` and Stellar ledger `L` exist, anyone computes the beacon. The coordinator runs
   `snarkjs zkey beacon chest_N.zkey chest_final.zkey <beacon_hex> 10 -n="beacon drand R + stellar L"` and publishes
   the output. Anyone can rerun the same command and must get a byte-identical `chest_final.zkey`.
6. **Export and build.** Export `verification_key.json`, regenerate the Soroban verifier from it, build the wasm
   reproducibly (pinned toolchain, `stellar contract build`), and publish the wasm sha256 and `vk_fingerprint`.

## Verification (anyone can do this)

1. ptau: blake2b equals the published value; `snarkjs powersoftau verify` passes.
2. `chest_0000.zkey`: regenerate from r1cs + ptau; sha256 must match.
3. Each intermediate: `snarkjs zkey verify circuit.r1cs ptau chest_i.zkey` passes, and the list of contributions it
   prints matches the published list (names and hashes, in order).
4. Beacon: fetch drand round `R` (`https://api.drand.sh/public/R`) and its signature check, fetch Stellar ledger `L`
   from two independent Horizon servers; recompute `beacon_hex`; rerun `snarkjs zkey beacon` and compare sha256 with
   the published `chest_final.zkey`.
5. Final: `snarkjs zkey verify` on `chest_final.zkey` passes and lists every contribution plus the beacon.
6. Verifying key: `snarkjs zkey export verificationkey` gives the published `verification_key.json`; its sha256 equals
   the `vk_sha256` in the verifier manifest and the deployed verifier's `vk_fingerprint()`.
7. Deployed verifier: fetch the wasm from the network; its sha256 equals the reproducible build; the registry's
   `verifier()` returns that contract id.

A published `TRANSCRIPT.md` collects all of the above, with links, so a verifier does not have to trust the
coordinator's summary.

## Timeline (before open launch)

| When | Step |
| --- | --- |
| T-21 days | Publish this plan, inputs (step 1) and the open call |
| T-14 days | Registration closes for the first list; list published |
| T-7 days | Beacon announcement (drand round `R`, Stellar ledger `L`, formula) signed and published; window opens |
| T-7 to T-2 days | Contributions (about 5 minutes each, sequential) |
| T-2 days | Window closes |
| T-1 day | Beacon round / ledger reached; final zkey, vk and verifier wasm published |
| T-1 to T | Independent verification by at least two people outside the team; new verifier and registry deployed |
| T | Open launch on the new verifier only |

## After the ceremony

- The new verifying key means a new verifier contract and, because registries are immutable, a new registry that
  points to it. Chests on older registries keep the old verifier and should be closed or clearly labeled.
- Proofs from the old zkey do not verify against the new key, so the app must ship the new zkey and wasm at the
  same time as it switches registries.
- Nothing in this plan changes the circuit. A circuit change would need its own review and a new ceremony.

## What this does NOT give

- It does not make answers harder to guess (see `docs/KDF-PROPOSAL.md` and the answer-strength check).
- It does not stop one person from using many addresses (sybil). The registry only stops the same address from
  claiming twice in a group.
