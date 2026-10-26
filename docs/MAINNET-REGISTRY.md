# Mainnet registry deploy (one sample chest)

Deploys the **registry** (`contracts/chest`, `ChestZk`) plus the **post-ceremony Groth16 verifier**
(`contracts/verifier`) and creates ONE sample chest. Script: `scripts/mainnet/deploy-registry.sh`
(dry-run by default). Read-only checker: `scripts/mainnet/verify-registry.mjs`.

## Contract facts (read from source)

- Registry has **no `__constructor`**. It has `init(admin, verifier)`, a separate call. `init` only does
  `admin.require_auth()`, stores `Verifier` and `NextId=1`, and rejects a second call (`AlreadyInit` = #10).
  `admin` is not stored and there is no getter for the verifier.
- The token is **not** part of `init`; it is passed per chest in `create_chest(creator, fingerprint, token, prize, max_claims, deadline)`.
  Mainnet native XLM SAC: `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA`.
- `contracts/verifier` currently embeds the **testnet (single-party) VK**, fingerprint
  `161f9d19...0991c1`. It must be rebuilt from the ceremony export before mainnet.

## Commands

```bash
# 0. Build (rustup toolchain; Homebrew rustc 1.90 shadows rustup 1.99)
PATH=$HOME/.cargo/bin:$PATH stellar contract build --manifest-path contracts/verifier/Cargo.toml --out-dir $WASM_DIR
PATH=$HOME/.cargo/bin:$PATH stellar contract build --manifest-path contracts/chest/Cargo.toml    --out-dir $WASM_DIR

# 1. Dry-run (simulates every uploadable tx against https://mainnet.sorobanrpc.com, signs nothing)
SOURCE=<identity> WASM_DIR=$WASM_DIR \
VERIFIER_WASM_SHA256=<sha256 of the post-ceremony verifier wasm> \
  scripts/mainnet/deploy-registry.sh
#   unfunded SOURCE / bare key: add SIM_SOURCE_ADDRESS=<any funded mainnet G...>

# 2. Execute (spends XLM)
SOURCE=<identity> WASM_DIR=$WASM_DIR VERIFIER_WASM_SHA256=<...> SAMPLE_FINGERPRINT=<64 hex> \
  scripts/mainnet/deploy-registry.sh --execute

# 3. Re-check any time (read-only)
node scripts/mainnet/verify-registry.mjs            # deployments/registry-mainnet.json
```

Gates (the script REFUSES otherwise):

1. RPC passphrase must be `Public Global Stellar Network ; September 2015`; derived native SAC must equal the constant above.
2. A ceremony hash is mandatory: `VERIFIER_WASM_SHA256` (alias `CEREMONY_EXPORT_HASH`) or a `verifierWasmSha256`
   field in a ceremony manifest under `circuits/`. It must equal sha256 of the verifier wasm about to be uploaded.
   At the time of writing no ceremony output exists in the repo (the ceremony branch has tooling only).
3. The verifier wasm must not embed the testnet VK fingerprint.
4. `--execute` needs `SOURCE` as a funded identity, `ADMIN == SOURCE` address (init requires admin auth),
   `SAMPLE_FINGERPRINT`, balance >= total + 2 XLM, estimated total <= 80 XLM, and no existing `deployments/registry-mainnet.json`.

`DRYRUN_ALLOW_TESTNET_VK=1` skips gates 2-3 for dry-run only (never with `--execute`); output is flagged NOT EXECUTABLE.

## Funding (XLM; uploads simulated 2026-10-26 on mainnet, rest estimated)

| # | Item | Budget | Simulated / est. |
|---|------|-------:|-----------------:|
| 1 | Verifier wasm upload | 18.8 | 18.79 (sim) |
| 2 | Verifier instance | 0.5 | 0.5 (est) |
| 3 | Registry wasm upload | 14.0 | **15.09 (sim, over budget)** |
| 4 | Registry instance | 0.5 | 0.5 (est) |
| 5 | init | - | 0.05 (est) |
| 6 | create_chest | - | 0.1 (est) |
| 7 | claim (fee for one claim) | - | 0.1 (est; needs a real chest to simulate) |
| 8 | Sample chest prize (locked, refundable via `close_chest` after deadline) | 30 | 30 |
| 9 | Relayer float (`RELAYER_FLOAT_XLM`) | - | 5 |
| | **Total** | cap 80 | **70.13** (35.13 burned, 35 recoverable/working funds) |

Deploy/init/create_chest/claim cannot be simulated before the wasm and instance exist on-chain, so the script
prints estimates for them. Rent dominates the upload costs (large wasm entries with a long TTL).

## Front-run risk on init (important)

Deploy and init are two transactions. Between them anyone who sees the new contract id can call
`init(their_admin, malicious_verifier)` and permanently own the registry (a verifier that returns true drains every chest).
The script calls `init` immediately after deploy, then `verify-registry.mjs` reads the instance storage and requires
`Verifier == our verifier`. On mismatch it STOPS before any chest is funded. Residual risk is limited to wasted fees
because nothing is funded until verification passes. Proper fix (contract change, out of scope here): make `init`
a `__constructor` so deploy+init is atomic.

## Failure / rollback

- Upload hash mismatch: script stops; nothing else was sent. Uploads are idempotent (re-running only costs fees).
- Deploy ok, init failed or verify failed: abandon that registry id (do not create chests). Redeploy; the wasm is
  already uploaded so a retry costs ~0.5 XLM. Note the abandoned id in the incident log.
- Verifier deployed, registry step failed: the verifier instance is reusable; set nothing, re-run is NOT supported
  (the script deploys a fresh verifier); simply reuse manually via `stellar contract deploy` for the registry and `init`.
- Sample chest failed after verification: `deployments/registry-mainnet.json` is already written with `sampleChest: null`;
  create the chest manually with `create_chest` (command printed by the dry-run) and add it to the JSON.
- Recover prize: `close_chest(chest_id)` by the creator after the deadline (or once exhausted).
- The script never overwrites `deployments/registry-mainnet.json`; move it away to redeploy.
- Caveat: the `init`-storage decoding in `verify-registry.mjs` (key `["Verifier"]`) and the second-init `#10` check could only
  be exercised against a fake deployment before the first real run; confirm they print OK right after the real deploy.
