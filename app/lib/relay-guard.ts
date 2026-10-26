import { WALLET_WASM_HASH, type NetConfig } from "./network";
import { checkRelayable, type RelayVerdict } from "./relay-policy";

/** Tope de la fee de la tx FINAL que el relayer paga (stroops). Mainnet: 2 XLM. Env RELAY_MAX_FEE_STROOPS. */
export function relayMaxFee(c: NetConfig): bigint {
  const env = Number(c.IS_MAINNET ? process.env.RELAY_MAX_FEE_STROOPS_MAINNET ?? process.env.RELAY_MAX_FEE_STROOPS : process.env.RELAY_MAX_FEE_STROOPS);
  return BigInt(env > 0 ? env : c.IS_MAINNET ? 20_000_000 : 6_000_000_000); // testnet P29: el rent de una wallet nueva pasa de 4,29e9
}

/** Valida la tx contra la política de la red y el tope de fee declarada. */
export function vetRelayTx(xdrB64: string, c: NetConfig, relayerPublicKey?: string): RelayVerdict {
  const v = checkRelayable(xdrB64, c.NETWORK.passphrase, {
    registry: c.CONTRACTS.chest,
    xlmSac: c.XLM_SAC,
    walletWasmHashHex: WALLET_WASM_HASH,
    relayerPublicKey,
  });
  // El deploy de wallet llega con la fee "clamped" del cliente: el tope se aplica tras simular (ver route).
  if (v.ok && v.kind !== "wallet_deploy" && v.resourceFee > relayMaxFee(c)) {
    return { ok: false, reason: "resource fee above the relayer cap" };
  }
  return v;
}

/** Secretos del relayer POR RED: nunca se usa el de una red en la otra. */
export function relayerSecretFor(c: NetConfig): string | undefined {
  const v = c.IS_MAINNET ? process.env.RELAYER_SECRET_MAINNET : process.env.RELAYER_SECRET;
  return v?.trim() || undefined;
}
