# Loot

> Formerly **ChestZK**. Same product: puzzle chests with ZK proofs on Stellar.

Prize chests on Stellar with ZK proofs (Groth16 / BN254). Knowledge pays. Copying does not.

## Why Stellar

Native BN254 verification + cheap claims → knowledge-gated airdrops/events that bots cannot steal by replaying the ledger. Passkey smart wallets (C…) enter without seed phrases; OZ Channels (or fee-bump) sponsors fees.

## Testnet

| | |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Prize token (native XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Test token CHEST (fallback chest #2) | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Judge chest | **#6** (10 XLM × 10 slots) — Stellar question about the creator of SCP; answer not published |
| Attack-demo chest | **#7** (100 × 0.1 XLM, public answer on purpose; only used to build a proof the contract rejects) |
| Normal chest (attack demo, no ZK) | `CDMYX46WAU66OOAVXLBPTVXZ7EZF5NTS3X3T6S2AKSOADEBZD7OGEXCA` · chest **#1** · 30 slots · XLM · answer in plain text |

## Threat model

**Protects against copying.** On a normal chest the answer travels in plain text: anyone who sees the transaction (relayer, validators, explorers, a failed tx on the ledger) can copy it, and after the first claim it is public for every remaining slot. In ChestZK the recipient address is a public input of the Groth16 proof, so a copied proof only pays the original solver (`InvalidProof #6`).

**Answer secrecy depends on the answer.** Only `Poseidon(answer, salt)` is stored, but players need the salt to prove. Short answers (a number 0–1000) can be brute-forced; use phrases or rare words.

**The proof is bound to your address: if a bot copies it and changes the recipient, the contract rejects it. And each proof works only once.** One claim per proof, not per human. Each proof works once (nullifier) and only pays the address it was made for. The circuit does not bind the player secret to the recipient, so anyone who knows the answer can claim several slots with different secrets. Account farms are bounded by the chest's slots (`max_claims`); proof-of-personhood is future work.

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
| `/create` | Create a chest from your own account (you fund the prize) · public or private-link |
| `/panel` | List + **close** chest |

Spanish URLs 301 → English.

### Env

- `RELAYER_SECRET` — relayer key (claims, passkey fee-bump). Must be its own low-balance account, never the prize-funding one; no fallback to `CREATOR_SECRET`. On Vercel set `RELAYER_SECRET` (or `RELAYER_API_KEY` + `RELAYER_BASE_URL`).
- `CREATOR_SECRET` — local only: closing legacy server-created chests from `/panel` (`/api/chests/:id/close`, no fallback to the relayer key) and `bot/` scripts. Creators now sign `create_chest` with their own account.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Reown (WalletConnect) project id. Without it, mobile wallet apps (LOBSTR, Freighter mobile, xBull app…) cannot connect on phones; the wallet picker shows a notice and the console warns. It is a `NEXT_PUBLIC_*` var, so it is inlined **at build time**: set it in Vercel, then **redeploy**. See [docs/WALLETS.md](docs/WALLETS.md).
- `ADMIN_KEY` — only for `/panel` and `/api/chests/:id/close`; not needed to create chests.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (PRIVATE store: written with access:"private", read server-side only; blob URLs never reach the client) for chest metadata (question, hint, difficulty, salt of public chests). **Required in production/Vercel**: without it `/api/chests/meta` returns 503. Local dev without a token falls back to `data/chests.json` + `data/pending.json`. Metadata is write-once: reserved by fingerprint before creation, confirmed against `get_chest` (creator + fingerprint) after.
- Private-link chests: the salt is never stored; it travels only in the URL fragment (`/chest/<code>#s=<salt>`). Lose the link, lose the chest.
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
- Scans: `audits/` (scanned with Kuyfi, 0 findings; black-box scan, not an audit)

Tag: `mvp` · See `NOTES.md` / `BUGS.md` / `ROADMAP.md`.
