/** Stellar testnet defaults for Loot (ChestZK contracts). */
export const NETWORK = {
  name: "TESTNET",
  passphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
} as const;

export const CONTRACTS = {
  /** Registry ChestZk (many chests by id). */
  chest: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
  verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
  /** Native XLM SAC on testnet. */
  xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

/** 10 XLM per slot in stroops (7 decimals). */
export const DEFAULT_AMOUNT_PER_SLOT_STROOPS = 100_000_000n; // 10 * 10^7
