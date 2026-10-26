import type { NetConfig } from "./network";
import { relayMaxFee } from "./relay-guard";
import type { RelayVerdict } from "./relay-policy";

export type RelayKind = Extract<RelayVerdict, { ok: true }>["kind"];

/** La simulación pasó del tope de fee del relayer (p. ej. el deploy de wallet en mainnet antes de extender el TTL del wasm). */
export class RelayCapError extends Error {
  constructor(public minResourceFee: string) {
    super("fee above the relayer cap; transaction not relayed");
  }
}

/**
 * Log estructurado (una línea JSON) del costo de cada deploy de wallet en mainnet: sirve para ver el valor
 * real de minResourceFee cuando la extensión del TTL del wasm esté en cadena. Busca "passkey_wallet_deploy".
 */
export function logWalletDeployFee(c: NetConfig, kind: RelayKind | undefined, fields: Record<string, unknown>): void {
  if (!c.IS_MAINNET || kind !== "wallet_deploy") return;
  console.info(JSON.stringify({ event: "passkey_wallet_deploy", net: c.net, capStroops: relayMaxFee(c, kind).toString(), ...fields }));
}

export const SIGNUP_UNAVAILABLE =
  "Passkey signup is temporarily unavailable on Mainnet — connect a Stellar wallet";

