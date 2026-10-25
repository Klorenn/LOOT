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

/** Cofre demo para jueces / demo en vivo. Respuesta: 42 · sal: 7 */
export const DEMO_CHEST = {
  id: 1,
  question: "¿Cuántos bits tiene un byte?",
  hint: "Potencia de dos, entre 4 y 16",
  prize: 100,
  prizeLabel: "100 CHEST",
  salt: "7",
  /** Solo en demo — en producción la sal no sale del creador. */
  answer: "42",
  fingerprintHex:
    "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
} as const;

export const ZK_ASSETS = {
  wasm: "/zk/chest.wasm",
  zkey: "/zk/chest_final.zkey",
} as const;
