# ChestZK · MVP notes (tag `mvp`)

Handoff for the other person. Lisboa time context: freeze ~dom 25 afternoon (adelantado).

## Demo script (2 min)

1. Home → **Abrir un cofre** → `/enter` → Face ID gate → `/chest/3`
2. Pregunta: *¿Cuántos bits tiene un byte?* → respuesta **`8`**
3. Proving spinner → opened (1 USDC on testnet)
4. `/attack` → Run demo → panel derecho **RECHAZADO** (InvalidProof)
5. Optional: `/create` template → QR / link

## Testnet IDs

| | |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Prize token | testnet USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) |
| Test token CHEST (fallback) | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#3** (USDC, 1 USDC × 5 slots; create with `bot/setup-usdc-chests.mjs`) · salt `7` · answer `8` · fp `180d6965…0c78de`. **Fallback #2** (CHEST token, same question/fp): smoke claim [tx](https://stellar.expert/explorer/testnet/tx/fca835b7a46bb4dead2340b368eca34cf832c65b936808bb5dfd725548cf4fe3) |
| Normal chest (USDC) | `CAAHCYL56HSHLD7CYX7ESJXRLZG47HVJZ7QTL4MUD4L5H2A5PR4B4HSV` · chest #1 · 15 slots · 1 USDC each (old CHEST instance: `CCDYM5LN…A5KH`) · answer `8` in plain text (attack demo left side) |
| Legacy #1 | answer was `42` — do not use for judges |

## Local

```bash
cd app && pnpm install && pnpm dev
# secrets: app/.env.local  CREATOR_SECRET + RELAYER_SECRET
```

Routes (EN): `/enter` `/chest/:id` `/proving` `/opened` `/attack` `/create` `/panel`  
ES paths 301 → EN.

## Gotchas

- USDC: C… wallets need no trustline; classic G… need one (`lib/trust.ts`, auto before claim). Faucet: faucet.circle.com → deployer. `/api/attack/normal` is rate-limited (1/IP/60s, 6/h)
- Claim needs `--instructions 100000000` (BN254 verify)
- `create_chest` SDK result is a `Result` → `.unwrap()`
- Recipient field = `sha256(ScVal Address XDR)` with byte[0]=0
- Proof G2 limbs swapped (ethereum uncompressed)
- No Docker → deployer/relayer pays fees (plan B)
- Passkey = **passkey-kit** smart wallet (C…). `/api/passkey/send` prefers OZ Channels; else **local-channel**: rebuild envelope from `{func,auth}`, and when Protocol‑29 rent `resourceFee > uint32` set `inner.fee=0` + FeeBump (stellar-cli pattern). Client clamps carrier build fees (`passkey-fee-clamp.ts`). Classic G… only via UI “Demo sin passkey”, not silent fallback.
- `data/` chests meta is gitignored; demo #3 is hardcoded in `lib/config.ts`

## Bug list (known / non-blocking)

- [x] Passkey-kit smart wallet (C…) + classic fallback
- [x] OZ Channels hosted (no Docker) + fee-bump fallback
- [x] Creator panel close on-chain
- [ ] Home counters are static
- [x] Attack “normal chest” side is real on testnet (contracts/normal-chest, bot/steal-normal.mjs, /api/attack/normal)
- [ ] Widget is a link stub
- [x] CI (GitHub Actions)

## Do not touch for freeze

Circuit, verifier address, chest contract, demo answer for #2.
