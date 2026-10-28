import type { NetConfig } from "./network";

/**
 * Release gate: chest sets, registry v2, the persistent relay limits and the answer-strength check ship active on
 * testnet only. On mainnet every one of them is off, so mainnet behaves as it did before they existed.
 * One switch, so a later mainnet rollout is a single change here (plus the mainnet config in lib/network.ts).
 */
export const testnetFeatures = (c: Pick<NetConfig, "IS_MAINNET">): boolean => !c.IS_MAINNET;
