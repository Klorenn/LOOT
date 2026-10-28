# Proposal: argon2id before Poseidon for `answer_field`

Status: proposal only. Nothing here is implemented. No fingerprint computation, circuit, contract or SDK code was changed.

## Problem

A chest stores `fingerprint = Poseidon(answer_field, salt)` on-chain, and the salt is public for listed chests (it is in the URL fragment for private ones). Today `answer_field` is a single SHA-256 of the normalized answer with the top byte zeroed. So one guess costs one SHA-256 plus one Poseidon, about 1e8 guesses per second per GPU. Anyone can take the public `(fingerprint, salt)` pair and test guesses offline, with no rate limit and no signal to the creator. Short or common answers fall in seconds to hours. The app now warns and (on mainnet) blocks answers below an estimated 48 bits, which raises the floor but does not make weak answers safe. A slow KDF multiplies the cost of every guess.

## Proposal

```
answer_field = truncate248( argon2id(password = normalize(answer),
                                     salt     = bytes(chest_salt, 31 bytes),
                                     m = 64 MiB, t = 3, p = 1, outLen = 32) )   // top byte zeroed, as today
fingerprint  = Poseidon(answer_field, chest_salt)                                // unchanged
```

Key observation: `answer_field` is computed OUTSIDE the circuit. The circuit takes it as a private input and only checks `Poseidon(answer, salt) == fingerprint`. Replacing the SHA-256 step with argon2id is a client-side change to `answerToField`. Circuit, verifying key, ceremony output and registry contract stay as they are.

The salt used by argon2id is the same per-chest random 31-byte salt. It is public, so it does not hide anything. It prevents precomputed tables across chests and forces an attacker to pay the full KDF cost per guess per chest. The cost factor is what provides the protection.

## Parameters and why

- argon2id (not argon2d or argon2i): the hybrid is the standard recommendation for password hashing; the side channel concern is irrelevant here (the answer is typed locally) but argon2id costs nothing extra.
- 64 MiB memory: the memory requirement is what removes most of the GPU/ASIC advantage. Mobile Safari and low-end Android can run 64 MiB in a wasm worker; 19 MiB (OWASP minimum profile) is the fallback if field testing finds failures.
- t = 3, p = 1: single-threaded so the browser needs no SharedArrayBuffer or cross-origin isolation. Do not raise `p` to speed it up in the browser.
- Truncation to 248 bits keeps the value below the BN254 scalar field modulus, same as today.

## Impact

Numbers below are estimates from typical argon2id wasm benchmarks and must be measured on target devices before shipping.

### Proving time in the browser

None. The circuit and its witness are the same size; only the value of one private input changes. Groth16 proving time (snarkjs, wasm) is unaffected. What changes is a one-off KDF step before proving: roughly 0.2 to 0.8 s on a desktop, 1 to 3 s on a mid-range phone, at 64 MiB and t = 3. It runs once when the creator hashes the answer and once when the solver submits. It should run in a Web Worker so the UI stays responsive, and the UI should show "Hashing your answer..." for it. Sets pay it once per question on creation (N questions, N KDF runs) and once per question on solve.

### Attacker cost

An attacker now pays a 64 MiB argon2id run per guess instead of SHA-256 plus Poseidon. Practical GPU rates drop from about 1e8 per second to about 1e2 to 1e3 per second, a factor of roughly 1e5 to 1e6, or about 17 to 20 extra bits of work. The 48-bit floor then costs on the order of 1e11 to 1e12 seconds of one GPU instead of weeks. A KDF does not rescue a 20-bit answer ("lisboa" stays easy to find among likely words even at 1e3 guesses per second), so the strength check stays in place.

### `@findloot/sdk` (published, 0.1.1)

The SDK's `answerToField` and `fingerprintAnswer` implement the current SHA-256 path and are public API. Anyone using it computes version 1 fingerprints.

- An SDK that does not know about the KDF, given a version 2 chest, would compute the wrong `answer_field` and fail with "wrong answer" even when the answer is right. That failure mode is silent, so version 2 chests must carry an explicit version marker the SDK can read before it hashes.
- Add an optional `kdf` argument to `fingerprintAnswer(answer, salt, { kdf })` and a new `answerToFieldV2(answer, salt)`. Default stays `"v1"` in the 0.x line. Ship as a minor release; make `"argon2id-v1"` the default only in the next major.
- Use a wasm argon2id (for example `hash-wasm`) so the SDK stays isomorphic (Node and browser) with no native build step.
- Pin the algorithm output with test vectors shared between the app and the SDK, so both produce the same field element from the same `(answer, salt)`.

### Existing chests

Fingerprints are immutable on-chain, so existing chests cannot be upgraded. They stay version 1 forever, are as guessable as their answer, and keep working with the current app and SDK. The app must treat a missing version as v1. Creators who want the stronger scheme create a new chest. Mainnet chests already live were created under the old scheme and under the allowlist; the 48-bit answer floor now applies to new ones.

## Per-chest versioning

The registry has no field for a scheme version, and changing it is out of scope for the current registry. Proposal in two stages:

1. Now (no contract change): store `kdf: "v1" | "argon2id-v1"` in the chest metadata blob next to `salt`. Absent means `v1`. The app solve page and `GET /api/chests/[id]` read it and pick the hashing path. For private chests the link fragment that already carries the salt gets a version marker too (for example `#s=<salt>&k=2`), because the metadata may be absent. Both app and SDK reject an unknown `kdf` value with a clear "update the app or SDK" message instead of hashing wrongly.
2. Registry v2: add a small `scheme` byte to the chest record (or encode it in the creation event), so the version is authoritative on-chain and metadata loss cannot silently change how a chest verifies.

Create flow: new chests default to `argon2id-v1` once the KDF ships in the app; an "advanced" toggle is not needed.

## Rollout

1. Add argon2id to the app behind a flag, with shared test vectors and a benchmark page. Measure the KDF on a low-end Android phone, an older iPhone and desktop Safari/Chrome/Firefox. Decide 64 MiB or 19 MiB from those numbers.
2. Release SDK minor with `kdf` option and v2 helpers. Document the version marker.
3. Enable v2 for new chests on testnet, then mainnet. Keep v1 solving forever.
4. Revisit the answer-strength thresholds: with the KDF the weak/fair/strong cutoffs can move down by about 15 bits, but only after step 3 is the default and measured.

## Risks and open questions

- Unicode and normalization must be byte-identical across app, SDK and any future client. The current `normalizeAnswer` is shared; the KDF input must be exactly its output encoded as UTF-8.
- argon2 implementation drift across wasm builds: pin the library version and the test vectors.
- A solver on a very constrained device may fail to allocate 64 MiB. The version marker lets a chest choose the 19 MiB profile (`argon2id-v1-lite`) if needed.
- Solve-time latency is the user-visible cost. It is paid once per attempt and should be hidden behind the existing proving progress UI.
- The KDF protects the answer, not the prize rules: it does not change the one-claim-per-account behavior of sets, which is enforced only by this app's relayer.
- This is not a substitute for choosing a strong answer. It buys roughly 17 to 20 bits, not 40.
