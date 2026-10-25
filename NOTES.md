# ChestZK · MVP notes (tag `mvp`)

Handoff for the other person. Lisboa time context: freeze ~dom 25 afternoon (adelantado).

## Demo script (2 min)

1. Home → **Abrir un cofre** → `/enter` → Face ID gate → `/chest/2`
2. Pregunta: *¿Cuántos bits tiene un byte?* → respuesta **`8`**
3. Proving spinner → opened (CHEST on testnet)
4. `/attack` → Run demo → panel derecho **RECHAZADO** (InvalidProof)
5. Optional: `/create` template → QR / link

## Testnet IDs

| | |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Token | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#2** · salt `7` · answer `8` · fp `180d6965…0c78de` · smoke claim [tx](https://stellar.expert/explorer/testnet/tx/fca835b7a46bb4dead2340b368eca34cf832c65b936808bb5dfd725548cf4fe3) |
| Legacy #1 | answer was `42` — do not use for judges |

## Local

```bash
cd app && pnpm install && pnpm dev
# secrets: app/.env.local  CREATOR_SECRET + RELAYER_SECRET
```

Routes (EN): `/enter` `/chest/:id` `/proving` `/opened` `/attack` `/create` `/panel`  
ES paths 301 → EN.

## Gotchas

- Claim needs `--instructions 100000000` (BN254 verify)
- `create_chest` SDK result is a `Result` → `.unwrap()`
- Recipient field = `sha256(ScVal Address XDR)` with byte[0]=0
- Proof G2 limbs swapped (ethereum uncompressed)
- No Docker → deployer/relayer pays fees (plan B)
- Passkey = **passkey-kit** smart wallet (C…); `/api/passkey/send` via OZ Channels (`RELAYER_API_KEY`) or fee-bump (`RELAYER_SECRET`). Classic G… fallback if WebAuthn fails.
- `data/` chests meta is gitignored; demo #2 is hardcoded in `lib/config.ts`

## Bug list (known / non-blocking)

- [x] Passkey-kit smart wallet (C…) + classic fallback
- [x] OZ Channels hosted (no Docker) + fee-bump fallback
- [x] Creator panel close on-chain
- [ ] Home counters are static
- [ ] Attack “normal chest” side is simulated
- [ ] Widget is a link stub
- [x] CI (GitHub Actions)

## Do not touch for freeze

Circuit, verifier address, chest contract, demo answer for #2.
