# Loot · Transcript de la ceremonia Groth16 (fase 2) · 2026-10-26

> **Alcance honesto:** single human contributor + public Stellar beacon; not a trustless multi-party
> ceremony — a multi-party ceremony is planned before open launch.
>
> Una sola persona (Pau) aportó entropía en la fase 2. El beacon de Stellar mainnet impide que el último paso se
> elija a mano, pero NO reemplaza a más contribuyentes independientes: si Pau no hubiera descartado su entropía,
> la seguridad dependería de eso. La fase 1 sí es multi-parte (ptau público de Hermez, 54 contribuciones).
> Esta salida se usa para pruebas en **testnet**; nada se desplegó en mainnet.
>
> **Beacon:** Beacon ledger 65137885 was chosen at 00:35:17Z and recorded locally before it closed; it was NOT
> pre-announced publicly, so third parties can't independently confirm the choice preceded the ledger close.

- Fecha (UTC): 2026-10-26, 00:32–00:42
- Coordinador: agente `ceremony` (team Loot), en la máquina de Pau
- Scripts: `circuits/ceremony/` rama `ceremony`, commit `695da69`
- snarkjs: 0.7.6

## Entradas

| Artefacto | Valor |
|---|---|
| r1cs `circuits/build/chest.r1cs` sha256 | `c7696685542f119b8b37e748a23b3556181048cb4dadcab7fceef797505403d2` (1035 constraints) |
| circuito wasm sha256 | `53d2ae693ea92495be4d7b48d8f898b8598b5fe49dc87a4b9be6524d6446af36` |
| ptau | `powersOfTau28_hez_final_12.ptau` — https://circom.info/powersOfTau28_hez_final_12.ptau |
| ptau blake2b-512 | `ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a` = valor publicado en https://github.com/iden3/snarkjs#7-prepare-phase-2 |
| ptau sha256 | `dcf4ea473bf14b971ce5f7b7c1d6ce1c41a8ed042cdb75b65ca9178e3a3c7c17` |
| `snarkjs powersoftau verify` | `Powers of Tau Ok!` (exit 0, 70 min; cola del log en `logs/ptau_verify.log`) |
| `chest_0000.zkey` sha256 | `309d64b82771a1daece987a72c0fa9234b307d1324da09d892a4293d56c34388` (determinístico) |
| Circuit Hash (snarkjs) | `533054030f713a0a2069f7ac4ea04c016e97b4bbe541aee366b889169ab558d253e13b34b0dc1d3833d584703817a26b44bae1fb4886f3244d0d83907eabc044` |

## Contribuciones

| # | Participante | Fecha | Contribution hash (blake2b-512) | zkey salida sha256 |
|---|---|---|---|---|
| 1 | Pau (en su propia terminal, entropía tipeada + 64 B `/dev/urandom` + 64 B de snarkjs, solo por stdin) | 2026-10-26T00:33:06Z | `fba5bc1a63ae917216de8cd897ab1347ad30d8fc82c14aa085526a451c5242a64e0e0e82c8a45e7b5e32a8b626c3860a91f7fa03991fe7a4ea0beb5e3793792c` | `1b0fcf3941bf0ce3e831ee520b8b1f9f46f56c1d10b3de6f96867290bdca5ffa` |

`./verify.sh chest_0001.zkey` → `ZKey Ok!` con la contribución #1 "Pau" y el hash de arriba (`logs/chest_0001.verify.log`).
Las zkeys intermedias (`chest_0000`, `chest_0001`) se borraron tras el beacon; no se escribió entropía a disco.

## Beacon

| Campo | Valor |
|---|---|
| Elección | 2026-10-26T00:35:17Z: "beacon = hash del ledger 65137885 de Stellar mainnet" (último cerrado: 65137825, 00:35:08Z). Registrado localmente, NO anunciado públicamente (ver nota). |
| Red / ledger | Stellar mainnet, **65137885** |
| closed_at | 2026-10-26T00:40:08Z |
| Hash del ledger (beacon) | `4ed85c6b3d7e8b80774c91ca24fdcfa4c7cc81d2bf514202b909882e6e26c083` |
| Fuente | https://horizon.stellar.org/ledgers/65137885 — cross-check OK con https://horizon.stellar.lobstr.co |
| Iteraciones | 2^10 |
| Contribution hash del beacon | `73e0530a55754a0abece5190d2961b5b2ef1af6f7524b299c4d3324159c10419908cd5945085b0d67cc023a0167596a7ca767fc29a75daa9ab209b1fc22a57af` |

## Salida

| Artefacto | sha256 |
|---|---|
| `chest_final.zkey` | `5ff4aeb24038d8e70453479aea8971934bb9fdfbbc549858efdd1d2e6e45db2a` |
| `verification_key.json` | `be190a8b021afed05cb7ac47846e9c4bea6fb8140e29ba2273ccf7d75b01a8b1` |
| `vk_sha256` (verifier-manifest / `vk_fingerprint()`) | `3889d2e915b1118b40c0c825608bde088208f5d5b6e60ce4145b47a40fe070ef` |
| `verifier/src/lib.rs` | `cdfc1ff62d98cba1c00e2dadf56b80a013eb5d85026c96cc7ca7e09e830bf2ae` |
| verificador wasm (`chestzk_verifier.wasm`, 19 KB, `cargo +stable build --release --target wasm32v1-none`) | `8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5` |
| `./verify.sh chest_final.zkey` | `ZKey Ok!`: contribución #1 Pau + #2 "Final Beacon: Stellar mainnet ledger 65137885" (snarkjs recalcula el beacon) — `logs/chest_final.verify.log` |
| `cargo test` del verificador | 3 passed (incluye `verifies_embedded_test_vectors` con una prueba real de esta zkey) |

## Prueba en testnet (no mainnet)

Verificador nuevo + instancia nueva del registry `contracts/chest`; cofre de 1 XLM con respuesta/sal aleatorias
que nunca se imprimieron ni guardaron.

| Paso | Resultado |
|---|---|
| Verificador | `CB3MSD3R7ZYP5JCKGDGBXRUXR4JWPFUQWAJ5YQK6OPCEGULQOCL3NUUG` — `vk_fingerprint()` = `3889d2e9…070ef` ✓ |
| Registry | `CCM36X6EBWXQQ7ZPCKC2JNM3Z5BWSUGQ5NPKMKY6NZXKKMCRGOHEKONP` (init con el verificador nuevo) |
| Upload + deploy verificador, upload + deploy registry, init, create_chest | txs `fdc807b3…3207`, `e5c534e4…da3b`, `06809a46…a041`, `6604c28c…4cde`, `861292de…efb4`, `0fcd3189…3149` |
| Claim con la misma prueba y `recipient` cambiado | simulación: `Error(Contract, #6)` = InvalidProof; el verificador devolvió `verify_proof → false` (no se envía tx) |
| Claim legítimo | tx `dd40ecb041d56347b2471e21b5b0eb5684a6de9edcb8758fb5de366421094497` — evento `claimed`, +1 XLM al jugador, `claims: 1` |

Txs completas: https://stellar.expert/explorer/testnet/tx/<hash>.

La zkey final y el wasm del circuito están en `app/zk/` de este directorio; el crate del verificador, en `verifier/`. Todavía NO reemplazan `contracts/verifier` ni `app/public/zk` (se cablean por red aparte).
