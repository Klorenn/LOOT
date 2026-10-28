import { WALLET_WASM_HASH, type NetConfig } from "./network";
import { checkRelayable, type RelayVerdict } from "./relay-policy";
import { readChest } from "./chain";
import { relayMaxFee } from "./relay-fee-cap";

// Per-kind fee caps live in ./relay-fee-cap (both networks); re-exported for the routes.
export { relayMaxFee };

/** Valida la tx contra la política de la red (contratos, argumentos, cofres) y el tope de fee declarada. */
export async function vetRelayTx(xdrB64: string, c: NetConfig, relayerPublicKey?: string): Promise<RelayVerdict> {
  const v = await checkRelayable(xdrB64, c.NETWORK.passphrase, {
    registry: c.CONTRACTS.chest,
    registryV2: c.REGISTRY_V2.chest || undefined,
    xlmSac: c.XLM_SAC,
    walletWasmHashHex: WALLET_WASM_HASH,
    relayerPublicKey,
    chestInfo: (id) =>
      readChest(id)
        .then((ch) => ({ token: ch.token, creator: ch.creator }))
        .catch(() => null),
    allow: c.IS_MAINNET ? { ids: c.ALLOWED_CHEST_IDS, creators: c.CREATOR_ALLOWLIST } : undefined,
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
