# Prompt para Cursor: Loot — cierre antes del freeze (09:00)

**HackMeridian 2026 · Stellar testnet**  
**Marca:** **Loot** (antes ChestZK). UI y copy = Loot. Repo: `Klorenn/LOOT`. Org npm: `findloot` → `@findloot/sdk` + `@findloot/chest`.

Cofres con premio en **XLM nativo**. El jugador prueba con ZK (Groth16 BN254 en Soroban) que sabe la respuesta; la prueba lleva el `recipient` como entrada pública y un nullifier. Passkey-kit (C-address) + Stellar Wallets Kit (G). Relayer OZ Channels con fee-bump.

Revisa el repo real y reutiliza helpers; no inventes rutas. **No toques el circuito.** **No integres Soroswap ni ningún swap.**

---

## Decisiones de producto (ya tomadas — no reabrir)

| Tema | Decisión |
|------|----------|
| Nombre | **Loot** (no ChestZK en UI) |
| Premio | **XLM nativo**, 10 XLM por cupo. SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Swap / Soroswap / USDC en demo | **No.** |
| Contrato por cofre (fábrica) | **No para el freeze.** Demo = contrato-registro actual (`ChestZk` + `id`). Fábrica = *siguiente paso* (rama `factory` solo si sobra tiempo y no toca main). |
| Superficie para builders | **SDK `loot` primero** (+ API HTTP mínima de solo lectura). El contrato on-chain es la fuente de verdad. |
| QR | Sí: en **Mi wallet**, modal con QR de la dirección. |

---

## 0. Antes de todo

1. **Commit de checkpoint** del estado actual. Mensaje convencional, sin Co-Authored-By.
2. **`app/dashboard`, `app/explore`, `components/app`** — son pantallas v8 del mismo equipo (no las borres). Si hay conflictos de merge con otro agente, coordinar; no las excluyas “porque son de otro” sin preguntar.
3. Verifica `ADMIN_KEY` en `app/.env.local`. Si falta, **avisá y pará** esa parte — **no la inventes ni la pegues en chats**.
4. Repo: https://github.com/Klorenn/LOOT — Docs/GitHub apuntan ahí.

---

## 1. Premio en XLM — cofre #5

- Crear cofre nuevo (id esperado **#5**; confirmar con `get_chest` tras crearlo).
- Token: SAC XLM `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
- **10 XLM por cupo**, cupos suficientes para la demo (sugerido 5+).
- Misma pregunta/huella que el demo actual (`¿Cuántos bits tiene un byte?` / respuesta `8` / sal `7`) **o** pregunta nueva difícil de adivinar.
- Fondear con XLM de testnet (Friendbot a la cuenta creadora).
- Actualizar `DEMO_CHEST` a `#5` en `app/lib/config.ts` **solo** cuando `/api/chests/5` responda bien. Dejar `#2` comentado como respaldo.
- Cofre **normal** del modo ataque: también en XLM, cupos suficientes; apuntar `NORMAL_CHEST` ahí.
- Pantalla final: monto + moneda leídos del cofre real → **"10 XLM"**.
- En claim de cuenta G clásica: **eliminar** creación de trustline USDC/CHEST (XLM no la necesita).

---

## 2. Sesión de usuario (sin backend)

- **Passkey:** `keyId` + dirección C en `localStorage`; al volver, `connectWallet`.
- **Cuenta G:** sesión = wallet conectada (Stellar Wallets Kit); recordar cuál para reconectar.
- Un solo hook/contexto (`useSession` o el patrón del repo): `address`, `kind: 'passkey' | 'g'`, `connect`, `disconnect`.
- Guardar `playerSecret` por dirección. “Cerrar sesión” limpia estado local y avisa que el secreto vive en este dispositivo.

---

## 3. Vista “Mi wallet” (header con sesión)

- Dirección abreviada (`CABC…WXYZ` / `GABC…`) + **Copiar** (`navigator.clipboard.writeText`, “Copiado ✓” ~2 s, fallback).
- **Ver QR:** modal con QR de la dirección completa (`qrcode.react` u otra liviana), dirección en texto debajo, botón copiar en el modal.
- Link a la cuenta en Stellar Expert testnet.
- Saldo **XLM** (SAC) vía simulación de balance; refrescar + refresco tras claim.
- **Cofres ganados:** eventos `claimed` filtrados por dirección (`getEvents` RPC) + link a cada tx. Vacío claro. **Sin números de ejemplo / ExampleTag de mentira.**
- Botón **Cerrar sesión**.

---

## 4. SDK `@chestzk/sdk` (paquete en `/sdk`) — superficie para builders

Prioridad alta para el pitch; **no requiere fábrica**.

API del SDK (contra el contrato-registro actual):

- `createChest({ question, answer, amountPerSlotXlm, slots, signer })`  
  Normaliza respuesta (`trim`, minúsculas, sin acentos) → huella como la app hoy → llama `create_chest` → `{ chestId, txHash }`.
- `getChest(id)`, `listChests()` (o vía indexer/API).
- `claim({ chestId, answer, recipient, signer })` → prueba en cliente (circuito actual) + envío (passkey-kit + relayer OZ **o** wallet G).
- `close({ chestId, signer })`.

README con ejemplo de ~10 líneas. La app puede ir migrando a usar el SDK por dentro.

**API HTTP mínima (solo lectura):** `GET /api/chests`, `GET /api/chests/[id]`.

---

## 5. Fábrica / un contrato por cofre — FUERA DEL FREEZE

**No bloquear el demo de las 09:00.**

Si y solo si el demo XLM+#5+sesión+QR está verde y sobra tiempo:

- Rama `factory` (no merge a main sin pruebas).
- `Chest` (un cofre) + `ChestFactory` (`deployer().with_current_contract(salt)`).
- Creador paga deploy + premio; `close` reembolsa resto.
- Tests Rust: crear, claim, InvalidProof (copia), nullifier, sold out, close+refund.
- Nota: huellas nuevas del SDK (normalización) **no** son compatibles con huellas viejas del registro actual.

Si no llega: en la pitch decir “siguiente paso = factory + address por cofre”; demo sigue con el contrato actual.

---

## 6. Landing

- Contadores **reales** desde eventos `claimed` / `rejected`, o quitarlos. Nada de 84.300 XLM ni 2.941 inventados.
- Docs / GitHub → https://github.com/Klorenn/LOOT
- Sin copy de mempool/sender engañoso; botón **See the theft live →** a `/attack`.

---

## Criterios de aceptación

- [ ] `tsc` limpio; build ok (si lo pedís; el agente no buildea por defecto del equipo).
- [ ] **Probado en navegador** (no solo HTTP):
  - Claim en **#5** con passkey y con cuenta G.
  - Modo ataque: izquierda roba / derecha **REJECTED** solo con `InvalidProof` real; otros fallos = error de entorno (gris).
  - Sesión persiste al recargar.
  - Copiar + QR muestran la dirección exacta.
  - Saldos e historial cuadran con Stellar Expert.
- [ ] Sin cambios al circuito. Sin Soroswap.
- [ ] Commit final descriptivo antes de las 09:00.
- [ ] Reportar qué se probó y qué no.

---

## Notas operativas para Pau

1. **Poné vos** `ADMIN_KEY=…` en `app/.env.local` (hoy falta). Sin eso `/create` y panel admin dan 403.
2. **Repo:** https://github.com/Klorenn/LOOT (`origin` ya configurado).
3. Congelá features a las **09:00**. Checkpoint ya.
4. Alguien **tiene** que abrir el browser antes del freeze.
