# Reproducible wasm builds

Goal: the wasm deployed to mainnet is the exact file built by CI from a public tag, so stellar.expert shows the contract as
"verified source". The released wasm is the reference. A wasm built on a laptop is never deployed.

## What is pinned

| Piece | Pin | Where |
| --- | --- | --- |
| Build workflow | `stellar-expert/soroban-build-workflow` commit `6b16426d...` (tag `v28.1.0`) | `.github/workflows/release-wasm.yml` |
| stellar-cli | `28.1.0` (set by that workflow tag) | same |
| Rust | `1.91.0`, target `wasm32v1-none` | `contracts/chest/rust-toolchain.toml`, `contracts/verifier-mainnet/rust-toolchain.toml` |
| Dependencies | `Cargo.lock` committed in each contract dir (soroban-sdk 27.0.6 for the registry) | `contracts/*/Cargo.lock` |
| Build command (inside the workflow) | `stellar contract build --optimize --package <pkg> --meta source_repo=github:Klorenn/LOOT` | upstream workflow |

Do not bump any of these between the tag and the deploy. Bumping the workflow tag changes the CLI and can change the wasm bytes.

## Cut a release

1. Everything for the release is merged to `main` (contract code, `Cargo.lock`, and for the verifier the regenerated vk, see below).
2. Bump the crate `version` in `Cargo.toml` if the code changed (`chestzk-chest`, `chestzk-verifier`).
3. Tag `main` and push the tag:
   ```bash
   git tag contracts-v0.2.0 && git push origin contracts-v0.2.0
   ```
   Or run the "Release wasm" workflow manually and give a unique `release_name`.
4. The workflow runs two jobs (registry, verifier). Each one builds, creates a GitHub release, attaches
   `<package>_v<version>.wasm`, creates a build provenance attestation, and posts the build info to stellar.expert.
   Release tags look like `contracts-v0.2.0_contracts_chest_chestzk-chest_pkg0.1.1_cli28.1.0`.
5. Read the sha256 of each wasm from the job log (`WASM_HASH`) or run `sha256sum` on the release asset. Record both hashes.

## Rebuild locally and compare (optional audit)

```bash
cargo install --locked stellar-cli --version 28.1.0      # exactly the CLI the workflow uses
git checkout contracts-v0.2.0
cd contracts/chest                                        # rust-toolchain.toml installs 1.91.0 + wasm32v1-none
stellar contract build --optimize --package chestzk-chest \
  --out-dir /tmp/out-chest --meta source_repo=github:Klorenn/LOOT
shasum -a 256 /tmp/out-chest/*.wasm
```
Same for `contracts/verifier-mainnet` with `--package chestzk-verifier`. The `--meta` value is embedded in the wasm, so it must be
identical to the CI one. Compare with the release asset: `gh release download <release-tag> -R Klorenn/LOOT`.
Local reproduction of the CI bytes has NOT been confirmed yet (a full wasm build was skipped for lack of disk). If the hashes differ, the
release asset wins, and you should find out why before the deploy (toolchain, CLI version, or `--meta`).

Hashes from older local builds (for example `87d25664...` for the testnet registry v2, `88b24f39...` in `docs/REGISTRY-V2.md`) came from
other toolchains or flags and are not the reference. The only valid hash for mainnet is the one of the release asset.
The verifier `8df17eda...` was built with plain `cargo build` (see `docs/MAINNET-REGISTRY.md`); the CI build uses `stellar contract build --optimize`
and a new vk, so the post-ceremony verifier will have a different hash.

## Verifier vk: where it comes from

The verifier is generated code. `contracts/verifier-mainnet/src/lib.rs` holds the vk as constants (`VK_ALPHA`, `VK_BETA`, `VK_GAMMA`,
`VK_DELTA`, `VK_IC`, `VK_FINGERPRINT`) under the header "AUTO-GENERATED VK BYTES". `verifier-manifest.json` records the generator
(`soroban-verifier-gen-core 0.4.3`) and the `vk_sha256` of the source `verification_key.json`. The generator is not vendored in this repo.

Regenerate from the final ceremony vk with the crates.io CLI (same version as the manifest):
```bash
cargo install --locked soroban-verifier-gen --version 0.4.3
soroban-verifier-gen --vk circuits/ceremony/multiparty-2026-12/verification_key.json \
  --out /tmp/verifier-gen --crate-name chestzk-verifier --contract-name Groth16Verifier
```
Then copy the new vk constants and `verifier-manifest.json` into `contracts/verifier-mainnet` (keep the hand-maintained parts of
`lib.rs`: `Cargo.toml`, `[profile.release]`, `#![no_std]` layout), and check:
- `vk_sha256` in the manifest equals `sha256sum verification_key.json`;
- `git diff` on `lib.rs` only touches the generated constants (and test vectors if you pass `--proof`/`--public`);
- `cargo test` in `contracts/verifier-mainnet` passes.

The exact flags used for the 2026-10-26 verifier were not recorded. Before the ceremony closes, run the command above on the OLD vk
(`circuits/ceremony/release-2026-10-26`) and confirm it reproduces the committed constants; that proves the recipe.

## After the ceremony (order matters)

1. `bash scripts/ceremony/finalize.sh` (beacon, `chest_final.zkey`, `verification_key.json`, `BEACON.md`).
2. Regenerate the verifier from `verification_key.json` (section above) and run its tests.
3. Refresh anything pinned to the old vk (registry integration fixture `contracts/chest/fixtures/chestzk_verifier_ceremony.wasm` and its proofs, app zkey).
4. Commit to `main`, tag `contracts-vX.Y.Z`, wait for the workflow, record the two sha256 values.
5. Deploy the RELEASED wasm files (download from the release; do not rebuild): `stellar contract upload --wasm <file>` and deploy from the resulting hash.
6. Check, per contract, that the on-chain hash equals the release hash:
   ```bash
   stellar contract fetch --id <CONTRACT_ID> --network mainnet --out-file /tmp/deployed.wasm
   shasum -a 256 /tmp/deployed.wasm                       # must equal the release asset sha256
   gh attestation verify <file>.wasm -R Klorenn/LOOT      # provenance of the release asset
   ```
   Also check the verifier `vk_fingerprint()` on chain equals `vk_sha256` in the manifest.
7. Open the contract on stellar.expert (public network). It should show the source repo, commit and "verified". Verification is matched by
   wasm hash, so it only works if the deployed hash equals the workflow's hash. Verification can lag; re-check later.

## Limits to know

- The upstream workflow runs `rustup update` and installs the CLI from its own tag. Our `rust-toolchain.toml` is what fixes the Rust version for the build.
- It creates the GitHub release with `gh release create <tag>` without a target, so that release tag points to the default branch head, not necessarily the tagged commit. The attestation and the stellar.expert record use the commit of the run (`github.sha`), which is what matters.
- Each package needs a distinct name or version per release (two contracts with the same name and version conflict).
