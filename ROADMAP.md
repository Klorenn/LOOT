# ChestZK · Roadmap — HackMeridian 2026 (Genesis)

Fuente: [HackMeridian 2026 · Ideas para Genesis](https://hackmeridian-2026-ideas-para-genesis-yhiw.pages.grok.bot/) · sección 8.
Horas en hora de Lisboa.

## Hitos que no se mueven

| Hito | Cuándo |
|---|---|
| Go o no-go del verificador | dom 25 · 12:30 |
| Deploy v1 en testnet | dom 25 · 20:00 |
| Congelar features | lun 26 · 00:30 |
| Cofre público para jueces | lun 26 · 08:00 |
| Congelar código | lun 26 · 09:00 |
| Formulario enviado (cierre 12:00) | lun 26 · 11:30 |
| Final | mié 28 · 13:50 |

## Fase hackathon (dom 25, 10:45 → lun 26, 12:00)

| Bloque (Lisboa) | Persona 1 · ZK y contratos | Persona 2 · Front y UX | Hecho cuando… | Repos |
|---|---|---|---|---|
| Dom 10:45–12:30 · Spike | Circuito mínimo (huella + receptor + nullifier), setup Groth16, verificador BN254 desplegado y una prueba verificada en testnet; anotar el costo | Next.js + Tailwind + shadcn + Geist con los tokens de Glass Noir; passkey de prueba en testnet | 12:30 decisión. Go: la prueba verifica dentro del presupuesto. No-go: pasar a Groth16 sobre BLS12-381 con el ejemplo oficial y volver a decidir a las 14:00 | circom, circomlib, snarkjs, soroban-verifier-gen, soroban-examples, stellar-cli, smart-account-kit, shadcn/ui, geist-font |
| Dom 12:30–13:15 | Almuerzo | Almuerzo | Pausa real, lejos de la pantalla | — |
| Dom 13:15–17:00 | Contrato ChestZK: crear, reclamar, nullifier, cupos, cierre y eventos, con tests | Pantallas 1 a 6 con datos de prueba; relayer de OpenZeppelin en Docker apuntando a testnet | `cargo test` en verde; el relayer envía una transacción de prueba | rs-soroban-sdk, openzeppelin-relayer, relayer-plugin-channels |
| Dom 17:00–20:00 | Bindings TypeScript e integración de punta a punta | Prueba en el navegador con snarkjs, pantallas 4 y 5 conectadas | 20:00 deploy v1: un cofre real abierto desde un teléfono con Face ID | js-stellar-sdk, stellar-private-payments (referencia WASM) |
| Dom 20:00–20:45 | Cena | Cena | Pausa | — |
| Dom 20:45–00:30 | Bot atacante y cofre normal para comparar | Modo ataque, crear cofre con plantillas y QR, panel de la creadora | 00:30 congelar features: todo el MVP funciona en testnet; lo demás es extra | stellar-cli, js-stellar-sdk |
| Lun 00:30–01:00 | Commit, tag `mvp` y notas para el otro | Lista de bugs y pulido | Repo limpio y cómo seguir anotado | — |
| Lun 01:00–05:30 | Dormir | 01:00–02:30 pulido o extra (widget o x402) solo si el MVP está verde; dormir 02:30–07:00 | Nadie trabaja más de 2 h sin el otro despierto en algo crítico | x402-stellar, coinbase/x402 (extra) |
| Lun 05:30–08:00 | Deploy final en testnet, cofre público para jueces con su pista, CI en verde | (duerme hasta 07:00) 07:00–08:00 animaciones y prueba con compañeros del venue | 08:00 cofre para jueces funcionando desde un teléfono ajeno | stellar-cli |
| Lun 08:00–09:00 | README completo con IDs de contratos y cómo probarlo | Ensayo del guion y toma de pantallas | 09:00 congelar código: solo arreglos críticos | — |
| Lun 09:00–10:30 | Deck de 8 slides | Grabar y editar el video de unos 2 min con el modo ataque | Video subido con enlace público; deck en PDF | — |
| Lun 10:30–11:30 | Revisión cruzada de todos los enlaces | Llenar el formulario | 11:30 formulario enviado | — |
| Lun 11:30–12:00 | Margen | Margen | Cierre oficial a las 12:00, sin entregas tardías | — |

### Checklist de hitos

- [x] Spike del verificador con go o no-go — dom 12:30 — **GO a las 11:24**: prueba verificada on-ledger, fee 11.786 stroops (~0,0012 XLM). Contrato `CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE` · [tx](https://stellar.expert/explorer/testnet/tx/570e6e2fdc0da4ae749e80b32ef6ea671d70f478b17dff6de80a86f5e710abfb)
- [x] Contrato ChestZK con tests en verde — dom 17:00 — **hecho 11:35 / redeploy limpio 12:02**: 9/9 tests. Contrato `CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ` (alias `chestzk-chest`), initado con verifier `CCUF6M5Y…HXTIE`. Kuyfi 0 findings tras quitar el entrypoint `recipient_field` (el encoding va off-chain). Gotchas: `__constructor` y `contractimport!` → `init()` + `invoke_contract`.
- [x] Deploy v1 en testnet con un cofre abierto por Face ID — dom 20:00 — **adelantado 12:20**: cofre #1 creado + claim e2e on-chain ([tx](https://stellar.expert/explorer/testnet/tx/b3bb388a1da6edc2115e13a5a18e544ba848c81bb5817c164a8542e10e62de1d)). Front pantallas 1–6 + snarkjs + `/api/claim` (relayer plan B). Face ID = WebAuthn gate + keypair local (passkey-kit full queda para pulido).
- [ ] MVP completo y features congeladas — lun 00:30
- [ ] Cofre público para jueces — lun 08:00
- [ ] Código congelado — lun 09:00
- [ ] Video y deck listos — lun 10:30
- [ ] README final y formulario enviado — lun 11:30

> Estado al dom 25 ~12:30 Lisboa: spike ✅ · contrato + Kuyfi ✅ · deploy v1 (claim e2e) ✅ · modo ataque + crear + panel ✅. Siguiente: freeze 00:30 / pulido video.

- [x] Bot + modo ataque + crear cofre + panel — **12:30**: `/ataque` (split + log), `bot/attack.mjs` confirma InvalidProof (#6) al copiar prueba, `/crear` plantillas+QR, `/panel`.

## Hacia la final (lun 26, 12:00 → mié 28, 13:50)

| Cuándo | Qué | Hecho cuando… |
|---|---|---|
| Lun 12:00–18:00 | Dormir y comer; nada de código | Descansados |
| Lun noche | Arreglar solo bugs que rompan el demo, en una rama aparte | El demo pasa 3 veces seguidas |
| Mar mañana | Pitch de 2 min con cronómetro, al menos 5 veces; preparar respuestas a: ¿por qué Stellar?, ¿qué pasa con granjas de cuentas?, ¿costo de verificar? | Pitch en 2:00 justos |
| Mar tarde | Probar el demo con la red del venue y con datos móviles; cofres nuevos fondeados en testnet | Funciona en ambas redes |
| Mar tarde | Backup: video del demo descargado en dos laptops, capturas en el deck y una cuenta de demo precargada | Se puede presentar sin internet |
| Mié 28 mañana | Revisar el estado de testnet, recargar cofres y cargar baterías | Todo listo a las 12:00 |
| Mié 28, 13:50 | Presentación de finalistas | — |

## Después de la hackathon

| Plazo | Producto y técnica | Crecimiento y financiamiento | Métricas objetivo (propias, no datos) |
|---|---|---|---|
| 30 días (fin de noviembre) | Limpiar el código, ampliar los tests, revisión de seguridad interna del circuito y del contrato; publicar el SDK en alpha | Postular al SCF v7.0 en el Open Track (primitivas nuevas) o en el Integration Track, idealmente con referido de un embajador o mentor de la hackathon | Postulación enviada; SDK con docs; 3 cofres de prueba de la comunidad |
| 60 días (fin de diciembre) | Auditoría externa del circuito y del verificador; widget embebible; panel de la creadora completo | Primeros pilotos con eventos o comunidades de Stellar; los Instawards del SCF (hasta US$15.000) sirven para pilotos locales | Hallazgos críticos de la auditoría en cero; 2 pilotos en marcha |
| 90 días (fin de enero) | Mainnet beta con tope de premio por cofre; pistas pagadas por x402 y agentes que compiten | Comisión por cofre activa; casos publicados de los pilotos | Cofres creados, aperturas y copias rechazadas medidos en el panel; cero premios robados |

El SCF v7.0 paga en cuatro tramos: 10% al aprobarse, 20% con el MVP, 30% en testnet y 40% con el lanzamiento en mainnet verificado y la UX lista. Fuente: [Introducing SCF v7](https://stellar.org/blog/ecosystem/introducing-scf-v7).
