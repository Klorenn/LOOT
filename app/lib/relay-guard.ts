import { WALLET_WASM_HASH, type NetConfig } from "./network";
import { checkRelayable, type RelayVerdict } from "./relay-policy";
import { readChest } from "./chain";

type Kind = Extract<RelayVerdict, { ok: true }>["kind"];

const envNum = (v: string | undefined) => (Number(v) > 0 ? Number(v) : 0);

/**
 * Tope de la fee de la tx FINAL que paga el relayer (stroops), por forma de tx.
 *  - mainnet: 0.3 XLM (RELAY_MAX_FEE_STROOPS_MAINNET); el deploy de wallet tiene tope propio de 1 XLM
 *    (RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET) porque crea la instancia + signers y todavía no se midió en mainnet
 *    (el primer registro real loguea minResourceFee). Mainnet NUNCA lee las variables de testnet.
 *  - testnet: RELAY_MAX_FEE_STROOPS (6e9 por defecto: el rent de una wallet nueva pasa de 4,29e9).
 */
export function relayMaxFee(c: NetConfig, kind?: Kind): bigint {
  if (c.IS_MAINNET) {
    if (kind === "wallet_deploy") return BigInt(envNum(process.env.RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET) || 10_000_000);
    return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS_MAINNET) || 3_000_000);
  }
  return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS) || 6_000_000_000);
}

/** Valida la tx contra la política de la red (contratos, argumentos, cofres) y el tope de fee declarada. */
export async function vetRelayTx(xdrB64: string, c: NetConfig, relayerPublicKey?: string): Promise<RelayVerdict> {
  const v = await checkRelayable(xdrB64, c.NETWORK.passphrase, {
    registry: c.CONTRACTS.chest,
    xlmSac: c.XLM_SAC,
    walletWasmHashHex: WALLET_WASM_HASH,
    relayerPublicKey,
    chestToken: (id) =>
      readChest(id)
        .then((ch) => ch.token)
        .catch(() => null),
    allowedChestIds: c.ALLOWED_CHEST_IDS,
    // topes de la beta solo en mainnet (testnet sigue sin topes de premio ni de plazo)
    createLimits: c.IS_MAINNET
      ? {
          maxPrizeStroops: BigInt(Math.round(c.CAPS.maxPrizePerPlaceXlm * 1e7)),
          maxTotalStroops: BigInt(Math.round(c.CAPS.maxTotalPrizeXlm * 1e7)),
          maxDeadlineSecs: 30 * 86400,
          nowSec: Math.floor(Date.now() / 1000),
        }
      : undefined,
  });
  // El deploy de wallet llega con la fee "clamped" del cliente: su tope se aplica tras simular (ver route).
  if (v.ok && v.kind !== "wallet_deploy" && v.resourceFee > relayMaxFee(c, v.kind)) {
    return { ok: false, reason: "resource fee above the relayer cap" };
  }
  return v;
}

/** Secretos del relayer POR RED: nunca se usa el de una red en la otra. */
export function relayerSecretFor(c: NetConfig): string | undefined {
  const v = c.IS_MAINNET ? process.env.RELAYER_SECRET_MAINNET : process.env.RELAYER_SECRET;
  return v?.trim() || undefined;
}
