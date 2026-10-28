import type { NetConfig } from "./network";

export type RelayFeeKind = "create_chest" | "claim" | "claim_v2" | "close_chest" | "transfer" | "wallet_deploy";

const envNum = (v: string | undefined) => (Number(v) > 0 ? Number(v) : 0);

/**
 * Cap on the FINAL tx fee the relayer pays (stroops), per request kind, on BOTH networks.
 *  - mainnet: 0.3 XLM (RELAY_MAX_FEE_STROOPS_MAINNET); wallet deploy 1 XLM (RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET).
 *    Mainnet never reads the testnet variables.
 *  - testnet: 10 XLM for ordinary txs (RELAY_MAX_FEE_STROOPS; real ones cost well under 1 XLM) and 1 XLM for the
 *    wallet deploy (RELAY_MAX_DEPLOY_FEE_STROOPS). Measured with scripts/measure-wallet-deploy.mjs (simulation of
 *    the real shared-deployer deploy with a Genesis proof, 2026-10-28): resource fee 3,434,759 stroops (0.343 XLM).
 *    1 XLM is that plus ~2.9x margin for rent price drift and inclusion. If the wallet wasm ever needs a restore
 *    (the old 4.29e9-stroop observation), deploys are refused with fee_cap instead of draining the relayer:
 *    extend the wasm TTL, or raise the env cap on purpose.
 *    Testnet XLM is free but a faucet-funded relayer is still a shared resource: no request gets a blank check.
 */
export function relayMaxFee(c: Pick<NetConfig, "IS_MAINNET">, kind?: RelayFeeKind): bigint {
  if (c.IS_MAINNET) {
    if (kind === "wallet_deploy") return BigInt(envNum(process.env.RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET) || 10_000_000);
    return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS_MAINNET) || 3_000_000);
  }
  if (kind === "wallet_deploy") return BigInt(envNum(process.env.RELAY_MAX_DEPLOY_FEE_STROOPS) || 10_000_000);
  // Registry v2 claim (player-signed, recipient.require_auth): measured on testnet 2026-10-28 (app/scripts/
  // e2e-claim-auth.mjs, G recipient, with the 1e8 instruction leeway): resource fee 895,284 stroops. Cap 0.5 XLM
  // = ~5.6x that, room for a passkey __check_auth (secp256r1) and fee drift, far below the 10 XLM generic cap that
  // a hostile recipient contract could otherwise burn.
  if (kind === "claim_v2") return BigInt(envNum(process.env.RELAY_MAX_CLAIM_V2_FEE_STROOPS) || 5_000_000);
  return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS) || 100_000_000);
}
