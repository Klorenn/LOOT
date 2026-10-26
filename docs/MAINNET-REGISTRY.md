# Mainnet: registry + ceremony verifier

Mainnet runs on the REGISTRY contract (`contracts/chest`) with the post-ceremony Groth16 verifier. Only the contracts are
deployed by script; the sample chest is created by Pau from `/create` on the mainnet site (30 claims x 1 XLM, with an expiry).

## Verifier (ceremony)
`contracts/verifier-mainnet/` is a copy of `circuits/ceremony/release-2026-10-26/verifier` (ceremony VK). It must be built like the
release, with plain cargo, NOT `stellar contract build` (that changes the wasm bytes):

```bash
cd contracts/verifier-mainnet && cargo +stable build --release --target wasm32v1-none
shasum -a 256 target/wasm32v1-none/release/chestzk_verifier.wasm   # 8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5
```
`contracts/verifier` is the single-party TESTNET verifier and must never reach mainnet (the script refuses its VK fingerprint).
Prover assets: mainnet serves `/zk/mainnet/chest_final.zkey` (ceremony); testnet keeps `/zk/chest_final.zkey`.

## Deploy
```bash
export PATH=$HOME/.cargo/bin:$PATH
SOURCE=loot-mn-deployer scripts/mainnet/deploy-registry.sh            # dry-run: builds, simulates uploads, prints the budget
SOURCE=loot-mn-deployer scripts/mainnet/deploy-registry.sh --execute   # sends (refuses unless every preflight passes)
node scripts/mainnet/verify-registry.mjs                               # read-only check against deployments/registry-mainnet.json
```
Order: upload verifier, deploy verifier, upload registry, deploy registry, `init(admin, verifier)` immediately, read the instance
back (admin and verifier must match or the script stops), then write `deployments/registry-mainnet.json` (never overwritten).
`contracts/chest` has a separate `init` (no constructor), so there is a short front-run window; the post-init check catches it
and the instance is abandoned. Preflight: SOURCE funded, passphrase = PUBLIC, wasm sha256 vs pin, ceremony VK present.

Fees (simulated 2026-10-26): verifier upload 19.26 XLM, registry upload 15.09 XLM, deploy x2 ~0.5 each and init ~0.05 (estimates,
not simulable before the wasm exists). About 35.4 XLM of fees; keep the deployer above ~38 XLM. The sample chest prize is funded by
the creator account (Pau), not the deployer; the relayer float (8 XLM now) is funded separately.

## Deployed (2026-10-26, by the team lead from a pinned worktree)
Record: `deployments/registry-mainnet.json`. `verify-registry.mjs` all OK (init by our admin, a second init rejected, ceremony VK).

| Item | Id / tx |
|---|---|
| Verifier (ceremony, wasm 8df17eda…) | `CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY` |
| Registry | `CCMMITTW22KQHEYLZUFXDSWF3JJC36A2KIYQU6T2C6YGDAFXMEIQ64QP` |
| Token (native XLM SAC) | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` |
| Verifier upload tx | `2e8ffc74c2101bf696e15fe29a22afb82fd7b377ed5f4d108834a71f6e065434` |
| Verifier deploy tx | `b9d8730cf0427a65834f1036490c89a114fb6c79ce68eaa7925513de581114a6` |
| Registry upload tx | `60ec5c4515e8aaca528f6998d79252531b4f180fcf89d6555e4ae35b2e1d08fc` |
| Registry deploy tx | `efa584ab7fa43fa5aea20fb1f45ecd71515a56a9faa3bbbcafad0536cf55beba` |
| init tx | `24a48a856de1a53d6df808ce022f3403a9faccd28af32bc918d6eadea6d7cab8` |

Real cost: 29.93 XLM (below the 35.4 simulated). **Mainnet needs `STELLAR_INCLUSION_FEE` >= 200** (the CLI default of 100 timed out).
No chest was created by the script.

## Sample chest (created from /create, not by the script)
30 claims x 1 XLM = 30 XLM locked. `/create` requires an expiry in the future (deadline 0 is refused) and mainnet caps it at
30 days. The creator gets the unclaimed prize back with `close_chest`, but only AFTER the deadline or once all places are claimed
(a chest with no deadline would never be refundable).

## App configuration (one domain, both networks)
findloot.xyz serves testnet and mainnet. Visitors switch with the Testnet/Mainnet button (cookie `loot_net`; testnet by default;
`?net=mainnet|testnet` in a shared link sets it and redirects to the clean URL, share links always carry it).
**Never set `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` in production**: it only changes the default network for visitors without a cookie.
Mainnet is enabled once these server env vars exist (otherwise the switch reads "Mainnet (coming soon)"):

```
MAINNET_REGISTRY_ID=<deployments/registry-mainnet.json .registry>
MAINNET_VERIFIER_ID=<deployments/registry-mainnet.json .verifier>
MAINNET_RPC_URL=<mainnet Soroban RPC>      # sent to browsers: use a domain-restricted key
RELAYER_SECRET_MAINNET=S...                # never falls back to RELAYER_SECRET (testnet)
MAINNET_SAMPLE_CHEST_ID=1                  # enabled chest (listed in /explore, claimable through the relayer)
MAINNET_LISTED_IDS=                        # optional extra enabled ids (csv)
MAINNET_CREATOR_ALLOWLIST=G...,G...        # who may store chest metadata on mainnet (reserve) — add the creator wallet(s)
MAINNET_MAX_PRIZE_PER_PLACE_XLM=1          # beta caps (defaults 1 / 30)
MAINNET_MAX_TOTAL_PRIZE_XLM=30
```

## Mainnet relayer limits
- Allowlist (`lib/relay-policy.ts`): registry `create_chest` (token = native XLM SAC, prize <= per-claim cap, prize x claims <= total
  cap, deadline in the future and <= 30 days), `claim` / `close_chest` only for ENABLED chest ids whose on-chain token is the XLM
  SAC, SAC `transfer` from the authorizing wallet, passkey wallet deploy (wasm 97ce0478…). One op, no source-account auth, no fee-bump.
- `/api/claim` applies the same chest checks, uses ~100 stroops inclusion (10000 only on TRY_AGAIN) and refuses to sign if
  simulated resource fee + inclusion exceed the cap.
- Fee cap of the FINAL tx: 0.3 XLM (`RELAY_MAX_FEE_STROOPS_MAINNET`); wallet deploy 1 XLM (`RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET`)
  until its real mainnet cost is measured (the first registration logs `[passkey/send] minResourceFee`; lower the cap then).
- Max 60 sponsored passkey registrations (Blob markers `relay/mainnet/registrations/`, token `LOOT_READ_WRITE_TOKEN`); sponsoring stops
  below 3 XLM of effective relayer balance (Horizon, cached 10 s, in-flight fees subtracted); `/api/relayer/status` is `no-store`
  and reports `sponsoring:false` on errors. Rate limits: mainnet 10/min per IP, 120/min global; testnet 60/min per IP.
- Blob: testnet keys unchanged (`chests/<id>.json`, `pending/<fp>.json`); mainnet uses `mainnet/chests/…`, `mainnet/pending/…`.

## Mainnet metadata (`/api/chests/meta`)
On mainnet `reserve` is accepted only when the declared creator is in `MAINNET_CREATOR_ALLOWLIST`; `confirm` additionally needs the
on-chain creator to equal the declared one (always) and either the chest id to be enabled or the creator to be allowlisted.
With an empty allowlist nobody can create a chest from /create on mainnet: set it before Pau creates the sample chest.
