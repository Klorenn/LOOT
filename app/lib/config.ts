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
  token: "CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA",
} as const;

/**
 * Cofre demo para jueces / demo en vivo.
 * Pregunta = bits de un byte → respuesta 8 · sal 7.
 * (El cofre #1 quedó con huella de "42" por error de demo; no usarlo.)
 */
export const DEMO_CHEST = {
  id: 2,
  question: "¿Cuántos bits tiene un byte?",
  hint: "Potencia de dos, entre 4 y 16",
  prize: 100,
  prizeLabel: "100 CHEST",
  salt: "7",
  /** Solo en demo — en producción la sal no sale del creador. */
  answer: "8",
  fingerprintHex:
    "180d69653b073abf4b382cda712b8f25406392ca623915fcc3f25679030c78de",
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
