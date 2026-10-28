import type { NetConfig } from "./network";

export type RelayFeeKind = "create_chest" | "claim" | "close_chest" | "transfer" | "wallet_deploy";

const envNum = (v: string | undefined) => (Number(v) > 0 ? Number(v) : 0);

/**
 * Cap on the FINAL tx fee the relayer pays (stroops), per request kind, on BOTH networks.
 *  - mainnet: 0.3 XLM (RELAY_MAX_FEE_STROOPS_MAINNET); wallet deploy 1 XLM (RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET).
 *    Mainnet never reads the testnet variables.
 *  - testnet: 10 XLM for ordinary txs (RELAY_MAX_FEE_STROOPS; real ones cost well under 1 XLM) and 600 XLM for the
 *    wallet deploy (RELAY_MAX_DEPLOY_FEE_STROOPS; Protocol 29 rent for a new wallet was 4.29e9 stroops).
 *    Testnet XLM is free but a faucet-funded relayer is still a shared resource: no request gets a blank check.
 */
export function relayMaxFee(c: Pick<NetConfig, "IS_MAINNET">, kind?: RelayFeeKind): bigint {
  if (c.IS_MAINNET) {
    if (kind === "wallet_deploy") return BigInt(envNum(process.env.RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET) || 10_000_000);
    return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS_MAINNET) || 3_000_000);
  }
  if (kind === "wallet_deploy") return BigInt(envNum(process.env.RELAY_MAX_DEPLOY_FEE_STROOPS) || 6_000_000_000);
  return BigInt(envNum(process.env.RELAY_MAX_FEE_STROOPS) || 100_000_000);
}
