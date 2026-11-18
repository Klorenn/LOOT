Loot verifies Groth16 proofs on Stellar. Today its proving key comes from a single contributor, which is fine for a closed beta but not for an open mainnet launch: whoever kept that randomness could forge proofs. We are running a **multi-party phase-2 ceremony** so the key is safe as long as **at least one** participant destroys their randomness.

**We are looking for contributors.** It takes about 5 minutes on any laptop. We especially want people outside the Loot team: other Stellar/Soroban builders, auditors and community members. Contributors receive no keys or control over anything; you only add randomness.

## How to join

Comment on this issue with:
- your public handle (GitHub or X),
- a way to reach you during the window (Discord, Telegram or email).

Registration for the first list closes **2026-11-20**. The ordered list is published here on **2026-11-21** and frozen when the window opens. Late joiners go at the end if time allows. The coordinator (Pau Koh, Loot) contributes **last**, right before the window closes, and is verified like everyone else.

## Dates (UTC)

| When | What |
|---|---|
| 2026-11-20 | Registration closes |
| 2026-11-21 | Ordered list published here |
| 2026-11-22 00:00 | Window opens; `chest_0000.zkey` and its sha256 published here |
| 2026-11-22 → 11-29 00:00 | Contributions in list order, 24 h per turn (silent turns are skipped); the coordinator goes last |
| 2026-11-29 00:00 | Window closes. No contributions accepted after this |
| 2026-11-30 → 12-01 | Beacon applied; final zkey, verifying key and transcript published |

## What you do on your turn

You will get a message when it is your turn, with a link to the previous zkey (`chest_<prev>.zkey`, about 0.5 MB) and its sha256.

**1. Install** Node.js 18 or newer. No other setup: `npx` runs snarkjs 0.7.6.

**2. Download** into one folder:
- the previous zkey (link in the message),
- `chest.r1cs` from [`circuits/build/chest.r1cs`](https://github.com/Klorenn/LOOT/blob/main/circuits/build/chest.r1cs),
- the ptau: https://circom.info/powersOfTau28_hez_final_12.ptau

**3. Check the files are the published ones:**
```bash
shasum -a 256 chest_<prev>.zkey chest.r1cs        # must match the values posted here
python3 -c 'import hashlib,sys;print(hashlib.blake2b(open(sys.argv[1],"rb").read()).hexdigest())' powersOfTau28_hez_final_12.ptau   # must match the ptau value below
```

**4. Verify the previous contribution:**
```bash
npx snarkjs@0.7.6 zkey verify chest.r1cs powersOfTau28_hez_final_12.ptau chest_<prev>.zkey
```
It must end with `ZKey Ok!`.

**5. Contribute:**
```bash
npx snarkjs@0.7.6 zkey contribute chest_<prev>.zkey chest_<you>.zkey --name="<your handle>"
```
When asked, type a long random text (mash the keyboard). It never leaves your machine. snarkjs prints a **contribution hash**: copy it.

**6. Publish your contribution** in one comment on this issue, from your own GitHub account:
- `chest_<you>.zkey` zipped and attached (`zip chest_<you>.zip chest_<you>.zkey`, then drag the zip into the comment),
- its sha256 (`shasum -a 256 chest_<you>.zkey`),
- the contribution hash snarkjs printed,
- one line: "I generated this contribution myself and deleted the random input."

If you registered with X, also post the sha256 and contribution hash there and link it.

**7. Clean up:** delete the random text you typed and any files you don't need.

That's it. The next person continues from your zkey.

## Frozen inputs

| Input | Value |
|---|---|
| Circuit | `circuits/chest.circom` (unchanged), commit `5df8920929af79c9a324a49352636bbf8cdab964` |
| r1cs sha256 | `c7696685542f119b8b37e748a23b3556181048cb4dadcab7fceef797505403d2` (1,035 constraints) |
| circuit wasm sha256 | `53d2ae693ea92495be4d7b48d8f898b8598b5fe49dc87a4b9be6524d6446af36` |
| Phase 1 | Hermez `powersOfTau28_hez_final_12.ptau` (54 contributions): https://circom.info/powersOfTau28_hez_final_12.ptau |
| ptau blake2b-512 | `ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a` (the value published in the snarkjs README) |
| ptau sha256 | `dcf4ea473bf14b971ce5f7b7c1d6ce1c41a8ed042cdb75b65ca9178e3a3c7c17` |
| snarkjs | `0.7.6` |
| `chest_0000.zkey` (starting point, from `snarkjs groth16 setup chest.r1cs powersOfTau28_hez_final_12.ptau chest_0000.zkey`; deterministic, anyone can regenerate it) | sha256 `309d64b82771a1daece987a72c0fa9234b307d1324da09d892a4293d56c34388`, file in [`circuits/ceremony/multiparty-2026-12/`](https://github.com/Klorenn/LOOT/tree/main/circuits/ceremony/multiparty-2026-12) |

## Beacon (announced before any contribution)

The last step uses a random beacon that nobody can choose or predict:
- **drand** mainnet, default chain (`8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce`), **round `R = 6685526`** (scheduled for 2026-11-30 00:00:00 UTC).
- **Stellar mainnet ledger `L = 65750791`** (expected around 2026-11-30 12:00 UTC at ~5 s per ledger; even at 4.8 s it closes after the window).
- Beacon value: `sha256(drand_randomness(R) || stellar_ledger_hash(L))`, hex.
- Applied with `snarkjs zkey beacon chest_N.zkey chest_final.zkey <beacon_hex> 10`.

Anyone can recompute the beacon (`https://api.drand.sh/public/6685526` and the ledger hash from two Horizon servers) and rerun the command to get a byte-identical `chest_final.zkey`.

## Verification (anyone)

Full steps in [`docs/CEREMONY-PLAN.md`](https://github.com/Klorenn/LOOT/blob/main/docs/CEREMONY-PLAN.md): check the ptau hash, regenerate `chest_0000.zkey`, run `snarkjs zkey verify` on every intermediate, recompute the beacon, and compare the final verifying key fingerprint with the one in the new verifier contract.

**Target:** at least 8 contributors, 5 of them outside the team. **Minimum to proceed:** 3 contributors outside Loot and Tellus Cooperative.
