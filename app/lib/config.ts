/** IDs de testnet — actualizados tras el redeploy limpio (Kuyfi 0 findings). */
export const NETWORK = {
  name: "TESTNET",
  passphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
} as const;

export const CONTRACTS = {
  chest: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
  verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
  /** SAC del USDC de Circle en testnet (Asset("USDC", USDC.issuer).contractId). */
  token: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  /** Token de prueba CHEST (cofre #2, fallback). */
  chestToken: "CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA",
} as const;

export const USDC = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  decimals: 7,
  /** Premio por cupo en USDC (unidades enteras). */
  prize: 1,
} as const;

/** USDC → stroops (7 decimales), sin errores de coma flotante. */
export function usdcToStroops(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC.decimals));
}

/**
 * Cofre demo para jueces / demo en vivo.
 * Pregunta = bits de un byte → respuesta 8 · sal 7.
 * (El cofre #1 quedó con huella de "42" por error de demo; no usarlo.)
 */
export const DEMO_CHEST = {
  // Temporal: #2 (CHEST). El #3 on-chain es otro cofre (pregunta Meridian, huella 18e45b94…).
  // El próximo cofre demo (XLM o USDC) saldrá con id 5.
  id: 2,
  question: "¿Cuántos bits tiene un byte?",
  hint: "Potencia de dos, entre 4 y 16",
  prize: 100,
  prizeLabel: "100 CHEST",
  slots: 5,
  salt: "7",
  /** Solo en demo — en producción la sal no sale del creador. */
  answer: "8",
  fingerprintHex:
    "180d69653b073abf4b382cda712b8f25406392ca623915fcc3f25679030c78de",
} as const;

/** Fallback documentado: cofre #2 paga CHEST (token de prueba), misma pregunta y huella. */
export const DEMO_CHEST_FALLBACK = {
  id: 2,
  prizeLabel: "100 CHEST",
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
 * Mismo premio (USDC) y misma pregunta que DEMO_CHEST; cada demo gasta 2 cupos.
 */
export const NORMAL_CHEST = {
  // Temporal: contrato con CHEST (fondeado). El de USDC (CAAHCYL5…B4HSV) aún no tiene cofre.
  contract: "CCDYM5LN63JCXX42VIXMIDPRKVN6IPAUF6SE6S77PZ3FFLYWDDIQA5KH",
  id: 1,
  slots: 50,
  prize: 100,
  assetCode: "CHEST",
  assetIssuer: "GAVLW5IKB7VFBRJ3EHBE4BRZ5OX3AOW3ICMLMB6KVKCQDO6WJ2SPHDN3",
} as const;

