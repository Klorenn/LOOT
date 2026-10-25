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
| Prize token | native XLM SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (10 XLM per slot, no trustline) |
| Test token CHEST (fallback) | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#6** (XLM, 10 XLM × 10 slots; create with `bot/setup-xlm-chests.mjs`, answer via `ANSWER=` env, never committed) · fp `2df98e7f…eaab19`. Attack-demo chest **#7** (100 × 0.1 XLM, public answer, see `ATTACK_CHEST`); #5 and #2 are retired fallbacks |
| Normal chest (XLM) | `CDMYX46WAU66OOAVXLBPTVXZ7EZF5NTS3X3T6S2AKSOADEBZD7OGEXCA` · chest #1 · 30 slots · 10 XLM each · answer `8` in plain text (attack demo left side) |
| Legacy #1 | answer was `42` — do not use for judges |

## Local

```bash
cd app && pnpm install && pnpm dev
# secrets: app/.env.local  CREATOR_SECRET + RELAYER_SECRET
```

Routes (EN): `/enter` `/chest/:id` `/proving` `/opened` `/attack` `/create` `/panel`  
ES paths 301 → EN.

## Gotchas

- Prize is native XLM: no trustline for any account. `/api/attack/normal` is rate-limited (1/IP/60s, 6/h)
- Claim needs `--instructions 100000000` (BN254 verify)
- `create_chest` SDK result is a `Result` → `.unwrap()`
- Recipient field = `sha256(ScVal Address XDR)` with byte[0]=0
- Proof G2 limbs swapped (ethereum uncompressed)
- No Docker → deployer/relayer pays fees (plan B)
- Passkey = **passkey-kit** smart wallet (C…). `/api/passkey/send` prefers OZ Channels; else **local-channel**: rebuild envelope from `{func,auth}`, and when Protocol‑29 rent `resourceFee > uint32` set `inner.fee=0` + FeeBump (stellar-cli pattern). Client clamps carrier build fees (`passkey-fee-clamp.ts`). Classic G… only via UI “Demo sin passkey”, not silent fallback.
- `data/` chests meta is gitignored; demo #6 is hardcoded in `lib/config.ts`

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
