/**
 * Mainnet: sin cuentas passkey por ahora. El deploy de un smart wallet de passkey simula a ~49.4 XLM de
 * costo de recursos en mainnet (minResourceFee 494028463), muy por encima de lo que el relayer paga.
 * Testnet no cambia.
 */
export const MAINNET_PASSKEY_NOTE =
  "On Mainnet, connect a Stellar wallet (Freighter, xBull, LOBSTR…). Passkey accounts are testnet-only for now.";

export const MAINNET_PASSKEY_SIGNOUT =
  "Passkey accounts are testnet-only for now. You were signed out of your passkey account on Mainnet: connect a Stellar wallet (Freighter, xBull, LOBSTR…).";
