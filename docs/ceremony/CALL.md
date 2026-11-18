# Loot trusted setup ceremony — open call (drafts)

Drafts to publish by **2026-11-17**. The issue is live (#4, https://github.com/Klorenn/LOOT/issues/4, opened by Klorenn); X and Discord posts are not posted yet. Dates moved earlier on 2026-11-16: window Nov 22–28.

Frozen inputs computed on 2026-11-14 and beacon recomputed on 2026-11-17 (ledger 65518771) from the repo (`main` at `dbe6282`), drand's public API and Stellar Horizon.

---

## 1. GitHub issue (title + body)

**Title:** Open call: multi-party trusted setup ceremony for Loot (Nov 22–28, 2026)

**Body:**

Loot verifies Groth16 proofs on Stellar. Today its proving key comes from a single contributor, which is fine for a closed beta but not for an open mainnet launch: whoever kept that entropy could forge proofs. We are running a **multi-party phase-2 ceremony** so the key is safe as long as **at least one** participant destroys their randomness.

**We are looking for contributors.** It takes about 5 minutes on any laptop. We especially want people outside the Loot team: other Stellar/Soroban builders, auditors and community members.

### How to join
Comment on this issue with:
- your public handle (GitHub or X),
- a way to reach you during the window.

Registration for the first list closes **2026-11-20**. The ordered list is published here on **2026-11-21** and frozen when the window opens. Late joiners go at the end if time allows. The coordinator (Pau Koh, Loot) contributes **last**, right before the window closes, and then the announced beacon is applied. The coordinator's contribution is verified like everyone else's, and the key stays safe as long as any one participant destroys their randomness.

### Dates (UTC)
| When | What |
|---|---|
| 2026-11-22 00:00 | Window opens; `chest_0000.zkey` and its sha256 published here |
| 2026-11-22 → 11-29 00:00 | Contributions, in list order (24 h per turn; silent turns are skipped); the coordinator contributes last |
| 2026-11-29 00:00 | Window closes. No contributions accepted after this |
| 2026-11-30 → 12-01 | Beacon applied once drand round `R` and Stellar ledger `L` exist; final zkey, verifying key and transcript published |

### What you run
Requirements: Node.js and `snarkjs@0.7.6`.
```bash
npx snarkjs@0.7.6 zkey verify chest.r1cs powersOfTau28_hez_final_12.ptau chest_<prev>.zkey
npx snarkjs@0.7.6 zkey contribute chest_<prev>.zkey chest_<you>.zkey --name="<your handle>"
```
Type random text when asked. That entropy never leaves your machine. Then:
1. upload `chest_<you>.zkey` (we send you the upload link),
2. post its sha256 and the contribution hash snarkjs printed, **from your own GitHub or X account**,
3. delete the entropy and any local copies you don't need.

### Frozen inputs
| Input | Value |
|---|---|
| Circuit | `circuits/chest.circom` (unchanged), commit `5df8920929af79c9a324a49352636bbf8cdab964` |
| r1cs sha256 | `c7696685542f119b8b37e748a23b3556181048cb4dadcab7fceef797505403d2` (1,035 constraints) |
| circuit wasm sha256 | `53d2ae693ea92495be4d7b48d8f898b8598b5fe49dc87a4b9be6524d6446af36` |
| Phase 1 | Hermez `powersOfTau28_hez_final_12.ptau` (54 contributions): https://circom.info/powersOfTau28_hez_final_12.ptau |
| ptau blake2b-512 | `ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a` (the value published in the snarkjs README) |
| snarkjs | `0.7.6` |

### Beacon (announced now, before any contribution)
The last step uses a random beacon that nobody can choose or predict:
- **drand** mainnet, default chain (`8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce`), **round `R = 6685526`** (scheduled for 2026-11-30 00:00:00 UTC).
- **Stellar mainnet ledger `L = 65750791`** (expected around 2026-11-30 12:00 UTC at ~5 s per ledger; even at 4.8 s it closes after the window).
- Beacon value: `sha256(drand_randomness(R) || stellar_ledger_hash(L))`, hex.
- Applied with `snarkjs zkey beacon chest_N.zkey chest_final.zkey <beacon_hex> 10`.

Anyone can recompute the beacon (`https://api.drand.sh/public/6685526` and the ledger hash from two Horizon servers) and rerun the command to get a byte-identical `chest_final.zkey`.

### Verification (anyone)
Full steps in [`docs/CEREMONY-PLAN.md`](../CEREMONY-PLAN.md): check the ptau hash, regenerate `chest_0000.zkey`, run `snarkjs zkey verify` on every intermediate, recompute the beacon, and compare the final verifying key fingerprint with the one in the new verifier contract.

**Target:** at least 8 contributors, 5 of them outside the team. **Minimum to proceed:** 3 contributors outside Loot and Tellus Cooperative.

---

## 2. X post

> Loot is running a public trusted setup ceremony 🔐
>
> Our ZK prize chests on Stellar need a proving key nobody can forge. With a multi-party ceremony, it's safe as long as ONE participant is honest.
>
> ~5 min on any laptop. Nov 22–28.
> Sign up 👇
> ⟨link to issue⟩

## 3. Discord (Stellar dev + Stellar Chile)

> **Open call: Loot trusted setup ceremony (Nov 22–28)**
> We're running a multi-party Groth16 phase-2 ceremony before opening Loot's ZK prize chests on mainnet. It takes ~5 minutes on any laptop (Node + snarkjs 0.7.6), and the key stays safe as long as at least one contributor destroys their randomness.
> We especially want contributors outside our team. Sign up on the issue by Nov 20: ⟨link⟩
> Inputs, beacon (drand round + Stellar ledger) and verification steps are all published there.

## 4. Spanish version for Stellar Chile

> **Convocatoria: ceremonia de trusted setup de Loot (22–28 nov)**
> Antes de abrir los cofres ZK de Loot en mainnet, vamos a hacer una ceremonia multi-party. Toma ~5 minutos en cualquier laptop, y la clave queda segura mientras al menos una persona borre su aleatoriedad. Buscamos sobre todo gente de afuera del equipo. Inscripción en el issue hasta el 20 de noviembre: ⟨link⟩

---

## Coordinator to-do before 2026-11-22
- [ ] Publish the issue, X post and Discord messages (by 2026-11-17).
- [ ] Download the ptau, check its blake2b, generate `chest_0000.zkey` with `snarkjs groth16 setup` and publish its sha256.
- [ ] Set up the upload location for intermediate zkeys.
- [ ] Publish the ordered list on 2026-11-21.

---

## Turn message (send to each contributor when their turn starts)

English:

> Hi <name>! Your turn in the Loot ceremony starts now and you have 24 h (until <date, HH:MM UTC>).
>
> - Previous zkey: <PREV_URL>
> - File name: <chest_000N.zkey> → you produce <chest_000N+1.zkey>
> - sha256 of the zkey: `<PREV_SHA256>`
>
> Steps (manual or with your AI agent): https://github.com/Klorenn/LOOT/issues/4
> If you use the agent prompt, fill PREV_URL, PREV_SHA256 and MY_HANDLE with the values above.
> When done, post the zip, sha256, contribution hash and the declaration line on the issue from your own account, and reply here so I can pass the turn on. Thanks!

Español:

> ¡Hola <nombre>! Arranca tu turno en la ceremonia de Loot y tenés 24 h (hasta el <fecha, HH:MM UTC>).
>
> - zkey anterior: <PREV_URL>
> - Nombre del archivo: <chest_000N.zkey> → vos generás <chest_000N+1.zkey>
> - sha256 del zkey: `<PREV_SHA256>`
>
> Pasos (a mano o con tu agente de IA): https://github.com/Klorenn/LOOT/issues/4
> Si usás el prompt para agentes, completá PREV_URL, PREV_SHA256 y MY_HANDLE con estos datos.
> Cuando termines, publicá en el issue desde tu cuenta el zip, el sha256, el contribution hash y la frase de declaración, y avisame acá para pasarle el turno al siguiente. ¡Gracias!

First turn values: PREV_URL `https://github.com/Klorenn/LOOT/raw/main/circuits/ceremony/multiparty-2026-12/chest_0000.zkey`, file `chest_0000.zkey` → `chest_0001.zkey`, sha256 `309d64b82771a1daece987a72c0fa9234b307d1324da09d892a4293d56c34388`.
For later turns: PREV_URL = the zip attached in the previous contributor's comment (right-click → copy link), and PREV_SHA256 = the sha256 they posted, after you verify it with `snarkjs zkey verify`.
