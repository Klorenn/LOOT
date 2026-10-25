# ChestZK

Cofres de premio en Stellar con prueba ZK (Groth16 / BN254). Quien sabe abre. Quien copia, no.

## Testnet (deploy actual)

| Qué | ID |
|---|---|
| Chest | `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` |
| Verifier | `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` |
| Token CHEST | `CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA` |
| Cofre demo jueces | **#2** — pregunta: ¿cuántos bits tiene un byte? → **8** |

## Probar local

```bash
cd app && pnpm install && pnpm dev
```

Abrí http://localhost:3000 → **Abrir un cofre** → respuesta `8`.

| Route | What |
|---|---|
| `/enter` | Passkey / Face ID gate |
| `/chest/:id` | Answer + claim |
| `/chest/:id/proving` | Groth16 prove + submit |
| `/chest/:id/opened` | Success |
| `/attack` | Split demo: normal vs ZK |
| `/create` | Templates + QR |
| `/panel` | Creator list |

Spanish URLs (`/cofre`, `/ataque`, …) redirect permanently to these.

Secrets en `app/.env.local` (`CREATOR_SECRET`, `RELAYER_SECRET`) — no commitear.

## Bot de ataque

```bash
cd app && node ../bot/attack.mjs --live
```

Esperado: `InvalidProof` (#6), evento `rejected`.

## Circuito / contratos

- `circuits/` — Circom Poseidon + snarkjs Groth16
- `contracts/chest` · `contracts/verifier`
- Auditoría Kuyfi: `audits/` (0 findings tras quitar `recipient_field`)

Ver `ROADMAP.md` para el cronograma HackMeridian.
