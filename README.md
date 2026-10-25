# ChestZK

Prize chests on Stellar with ZK proofs (Groth16 / BN254). Knowledge pays. Copying does not.

## Why Stellar

Native BN254 verification + cheap claims → knowledge-gated airdrops/events that bots cannot steal by replaying the ledger. Passkey smart wallets (C…) enter without seed phrases; OZ Channels (or fee-bump) sponsors fees.

## Testnet

| | |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Token CHEST | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#2** — “How many bits in a byte?” → **`8`** |

## Run

```bash
cd app
cp .env.example .env.local   # fill RELAYER_SECRET (+ optional RELAYER_API_KEY)
pnpm install && pnpm dev
```

Open http://localhost:3000 → **Abrir un cofre** → answer `8`.

### Routes

| Route | |
|---|---|
| `/enter` | Passkey smart wallet (Face ID) · classic fallback |
| `/chest/:id` | Answer + claim |
| `/chest/:id/proving` | Groth16 + submit |
| `/attack` | Stolen-proof demo → rejected |
| `/create` | Templates + QR |
| `/panel` | List + **close** chest |

Spanish URLs 301 → English.

### Env

- `RELAYER_SECRET` / `CREATOR_SECRET` — claim + create + fee-bump fallback
- `RELAYER_API_KEY` — [OZ Channels testnet](https://channels.openzeppelin.com/testnet/gen) (preferred; no Docker)

## Demo script (2 min)

1. `/enter` → passkey → `/chest/2` → `8` → opened  
2. `/attack` → RECHAZADO (InvalidProof)  
3. Optional `/create` → QR  

## Bot

```bash
cd app && node ../bot/attack.mjs --live
```

Expect contract error `#6` InvalidProof.

## Stack

- `circuits/` Circom + snarkjs Groth16  
- `contracts/chest` · `contracts/verifier`  
- `app/` Next 16 · passkey-kit · Glass Noir  
- Audits: `audits/` (Kuyfi 0 findings)

Tag: `mvp` · See `NOTES.md` / `BUGS.md` / `ROADMAP.md`.
