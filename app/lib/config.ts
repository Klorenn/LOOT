/** IDs de testnet — actualizados tras el redeploy limpio (Kuyfi 0 findings). */
export const NETWORK = {
  name: "TESTNET",
  passphrase: "Test SDF Network ; September 2015",
  /** Primario primero; el resto es fallback (ver lib/rpc.ts). Verificado: simulate/getLedgerEntries en ambos; el envío en el fallback no está verificado. */
  rpcUrls: [
    "https://soroban-testnet.stellar.org",
    "https://soroban-rpc.testnet.stellar.gateway.fm",
  ],
  /** Timeout de las lecturas antes de probar el siguiente RPC. */
  rpcTimeoutMs: 8000,
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
} as const;

export const CONTRACTS = {
  chest: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
  verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
  /** SAC del XLM nativo en testnet: token del premio. No requiere trustline. */
  token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

/** SAC del XLM nativo (testnet). */
export const XLM_SAC = CONTRACTS.token;

/**
 * Factory (un contrato por cofre). Espejo de deployments/factory-testnet.json: la config
 * on-chain (get_config) manda; esto es el fallback para cotizar sin RPC.
 */
export const FACTORY = {
  contract: "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV",
  treasury: "GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ",
  creationFeeStroops: BigInt(50_000_000),
  dailyFeeBps: 10,
  maxDurationDays: 30,
  maxPlaces: 50,
  maxQuestionLen: 280,
} as const;

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
  /** Dirección del cofre demo en la factory ("" = el demo sigue siendo el cofre legacy `id`). */
  address: "CDNU6Q35QZP56ND5XWHKQTH3QPPEQWV4QXSYFTAXSRR2SZ6QHQBCL5HR" as string,
  /** Posición del cofre demo en la factory (list_chests); define su URL /chest/<code>. */
  index: 5,
  // Factory: un contrato por cofre, 10 lugares × 10 XLM (bot/setup-factory-chest.mjs). `id` 6 es el
  // cofre legacy anterior (misma huella y sal), que sigue vivo en su URL vieja.
  // La respuesta NO está en el repo: solo la sal y la huella (públicas).
  // Fallbacks desactivados: #5 (misma config XLM, pregunta anterior; ya sin uso)
  // y #2 (token CHEST, ver bloque comentado más abajo).
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
export const LISTED_CHEST_IDS: readonly number[] = [DEMO_CHEST.id];

/** Cofres de la factory (dirección del contrato) siempre listados en /explore: demo y demás curados. */
export const LISTED_FACTORY_ADDRESSES: readonly string[] = DEMO_CHEST.address ? [DEMO_CHEST.address] : [];

/** Cofres de prueba públicos (#9, #10, #11) que no se listan en /explore; sus páginas siguen funcionando. */
export const HIDDEN_CHEST_IDS: readonly number[] = [9, 10, 11];

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
  /** Factory (50 lugares × 0.1 XLM, respuesta pública): de acá sale el InvalidProof de la demo. */
  address: "CA2LAPG3EIALHEJHASSUPKXEIXXDT5GX3WADABYWHVK4LJPAVFN6BIJ2",
  index: 6,
  /** Cofre legacy anterior (#7). */
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

/** Nombre legible del token de premio según su SAC. */
export function tokenLabel(tokenId: string): string {
  if (tokenId === CONTRACTS.token) return PRIZE.code;
  return "tokens";
}
