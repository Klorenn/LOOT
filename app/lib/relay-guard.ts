import { IS_MAINNET, CONTRACTS, NETWORK, WALLET_WASM_HASH, XLM_SAC } from "./config";
import { checkRelayable, type RelayVerdict } from "./relay-policy";

/** Tope de la fee de la tx FINAL que el relayer paga (stroops). Mainnet: 2 XLM. Env RELAY_MAX_FEE_STROOPS. */
export const RELAY_MAX_FEE_STROOPS = BigInt(
  Number(process.env.RELAY_MAX_FEE_STROOPS) > 0
    ? process.env.RELAY_MAX_FEE_STROOPS!
    : IS_MAINNET
      ? 20_000_000
      : 6_000_000_000, // testnet P29: el rent de una wallet nueva pasa de 4,29e9
);

/** Valida la tx contra la política y el tope de fee declarada. */
export function vetRelayTx(xdrB64: string, relayerPublicKey?: string): RelayVerdict {
  const v = checkRelayable(xdrB64, NETWORK.passphrase, {
    registry: CONTRACTS.chest,
    xlmSac: XLM_SAC,
    walletWasmHashHex: WALLET_WASM_HASH,
    relayerPublicKey,
  });
  // El deploy de wallet llega con la fee "clamped" del cliente: el tope se aplica tras simular (ver route).
  if (v.ok && v.kind !== "wallet_deploy" && v.resourceFee > RELAY_MAX_FEE_STROOPS) {
    return { ok: false, reason: "resource fee above the relayer cap" };
  }
  return v;
}
