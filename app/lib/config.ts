/** Constantes que no dependen de la red activa (la red por petición vive en lib/network.ts). */
export const PRIZE = {
  code: "XLM",
  decimals: 7,
  /** Premio por cupo en XLM (unidades enteras). */
  perSlot: 10,
  perSlotStroops: BigInt(10) * BigInt(10) ** BigInt(7),
} as const;

/** XLM → stroops (7 decimales), sin errores de coma flotante. */
export function xlmToStroops(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** PRIZE.decimals));
}

/** Decimales del token del premio (XLM = 7). */
export function tokenDecimals(_tokenId: string): number {
  return PRIZE.decimals;
}

/** unidades mínimas → "10" / "10.5" (sin ceros de más). */
export function stroopsToXlm(
  stroops: bigint | number | string,
  decimals: number = PRIZE.decimals,
): string {
  const v = BigInt(stroops);
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = v / unit;
  const frac = decimals
    ? (v % unit).toString().padStart(decimals, "0").replace(/0+$/, "")
    : "";
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Cofre demo para jueces / demo en vivo (pregunta sobre Stellar).
 */
export const DEMO_CHEST = {
  // #6: premio XLM nativo, 10 XLM × 10 slots (creado con bot/setup-xlm-chests.mjs).
  // La respuesta NO está en el repo: solo la sal y la huella (públicas).
  // Fallbacks desactivados: #5 (misma config XLM, pregunta anterior; ya sin uso)
  // y #2 (token CHEST, ver bloque comentado más abajo).
  /** Datos del demo de TESTNET (en mainnet cfg.DEMO_CHEST_ID = 0: no coincide con ningún cofre). */
  id: 6,
  question:
    "What is the surname of the creator of the Stellar Consensus Protocol (SCP)?",
  hint: "French surname; accents don't matter.",
  /** Valor con el que se creó el cofre; la UI de premio lee el real de la cadena. */
  prize: PRIZE.perSlot,
  prizeLabel: `${PRIZE.perSlot} ${PRIZE.code}`,
  slots: 10,
  salt: "205785768760272112960586331553946098354073419676685343877020392339824122894",
  fingerprintHex:
    "2df98e7f97c0c16bfeac31ca35d2f9b234ab3f7b9d442d1d3b9ac45643eaab19",
} as const;

// Fallback #2 (desactivado): misma pregunta y huella, premio en el token de prueba CHEST.
// #2 uses CHEST token, 0 decimals — restore chestToken if reactivating:
//   CONTRACTS.chestToken = "CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA"
//   tokenDecimals/tokenLabel must return 0 / "CHEST" for it; DEMO_CHEST.id = 2.

/**
 * Cofres que se muestran en /explore. Todo lo demás (#1 legacy, #2 CHEST, #5 retirado,
 * #7 de la demo de ataque, #8 de QA) existe on-chain pero no se lista.
 */

/** Cofres de prueba públicos (#9, #10, #11) que no se listan en /explore; sus páginas siguen funcionando. */

/**
 * Cofre dedicado al modo ataque (#7: 100 cupos × 0.1 XLM). La respuesta es PÚBLICA a propósito:
 * solo sirve para armar una prueba válida que el bot copia y el contrato rechaza.
 * OJO: `claim` revisa cerrado / vencido / agotado / nullifier usado ANTES de verificar la prueba,
 * así que si alguien cobra todos los cupos la demo fallaría con SoldOut en vez de InvalidProof.
 * Por eso el premio es mínimo (vaciarlo no vale nada) y hay muchos cupos. Si se agota, crear otro
 * con: ANSWER=<respuesta> SALT=7 SLOTS=100 PRIZE_STROOPS=1000000 bot/setup-xlm-chests.mjs zk
 * El premio real vive en DEMO_CHEST, cuya respuesta no está en el repo.
 */
export const ATTACK_CHEST = {
  id: 7,
  salt: "7",
  answer: "8",
} as const;

/** Cofre #1 (huella Poseidon(42,7)) — útil solo para demos de replay viejas. */
export const LEGACY_ATTACK_CHEST = {
  id: 1,
  answer: "42",
  salt: "7",
  fingerprintHex:
    "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
} as const;

export const ZK_ASSETS = {
  wasm: "/zk/chest.wasm",
  zkey: "/zk/chest_final.zkey",
} as const;

/**
 * Cofre NORMAL (sin ZK) para el modo ataque: la respuesta viaja en claro.
 * Mismo premio (XLM) y misma pregunta que DEMO_CHEST; cada demo gasta 2 cupos.
 * Instancia nueva de normal-chest con token = XLM SAC (el token se fija en init).
 */
export const NORMAL_CHEST = {
  contract: "CDMYX46WAU66OOAVXLBPTVXZ7EZF5NTS3X3T6S2AKSOADEBZD7OGEXCA",
  id: 1,
  slots: 30,
  prize: PRIZE.perSlot,
  /** Respuesta en claro a propósito: es el punto de la demo (el bot la lee del ledger). */
  answer: "8",
  /** Instancia previa (USDC/CHEST), sin uso: CAAHCYL5…B4HSV / CCDYM5LN…A5KH */
} as const;

/** SAC del XLM nativo de cada red: ambos se muestran como XLM. */
const XLM_SACS = ["CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"];

/** Nombre legible del token de premio según su SAC. */
export function tokenLabel(tokenId: string): string {
  if (XLM_SACS.includes(tokenId)) return PRIZE.code;
  return "tokens";
}
