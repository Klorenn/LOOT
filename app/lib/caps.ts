import { CAPS, stroopsToXlm, xlmToStroops } from "./config";

type Caps = { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number };

/** Topes de la beta en mainnet (infinitos en testnet). Mensaje claro o null. Prize en stroops por cupo. */
export function capError(prizeStroops: bigint, maxClaims: number, caps: Caps = CAPS): string | null {
  if (Number.isFinite(caps.maxPrizePerPlaceXlm) && prizeStroops > xlmToStroops(caps.maxPrizePerPlaceXlm))
    return `Beta limit: at most ${caps.maxPrizePerPlaceXlm} XLM per claim while the contracts are unaudited.`;
  const total = prizeStroops * BigInt(maxClaims);
  if (Number.isFinite(caps.maxTotalPrizeXlm) && total > xlmToStroops(caps.maxTotalPrizeXlm))
    return `Beta limit: at most ${caps.maxTotalPrizeXlm} XLM in total per chest (you set ${stroopsToXlm(total)} XLM).`;
  return null;
}
