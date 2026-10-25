# ChestZK

Prize chests on Stellar with ZK proofs (Groth16 / BN254). Knowledge pays. Copying does not.

## Why Stellar

Native BN254 verification + cheap claims → knowledge-gated airdrops/events that bots cannot steal by replaying the ledger. Passkey smart wallets (C…) enter without seed phrases; OZ Channels (or fee-bump) sponsors fees.

## Testnet

| | |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Prize token (testnet USDC SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Test token CHEST (fallback chest #2) | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#3** (1 USDC) — “How many bits in a byte?” → **`8`** |
| Normal chest (attack demo, no ZK) | `CAAHCYL56HSHLD7CYX7ESJXRLZG47HVJZ7QTL4MUD4L5H2A5PR4B4HSV` · chest **#1** · 15 slots · USDC · answer in plain text |

## Threat model

**Protects against copying.** On a normal chest the answer travels in plain text: anyone who sees the transaction (relayer, validators, explorers, a failed tx on the ledger) can copy it, and after the first claim it is public for every remaining slot. In ChestZK the recipient address is a public input of the Groth16 proof, so a copied proof only pays the original solver (`InvalidProof #6`).

**Answer secrecy depends on the answer.** Only `Poseidon(answer, salt)` is stored, but players need the salt to prove. Short answers (a number 0–1000) can be brute-forced; use phrases or rare words.

**One claim per proof, not per human.** The nullifier stops replays. Account farms are bounded by the chest's slots (`max_claims`); proof-of-personhood is future work.

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

Normal-chest side (real theft, answer read from the ledger):

```bash
node --env-file app/.env.local bot/steal-normal.mjs
```

## Stack

- `circuits/` Circom + snarkjs Groth16  
- `contracts/chest` · `contracts/verifier`  
- `app/` Next 16 · passkey-kit · Glass Noir  
- Audits: `audits/` (Kuyfi 0 findings)

Tag: `mvp` · See `NOTES.md` / `BUGS.md` / `ROADMAP.md`.
