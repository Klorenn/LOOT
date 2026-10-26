import { stroopsToXlm, xlmToStroops } from "./config";

type Caps = { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number };

/** Topes en mainnet (infinitos en testnet). Mensaje claro o null. Prize en stroops por cupo. */
export function capError(prizeStroops: bigint, maxClaims: number, caps: Caps): string | null {
  if (Number.isFinite(caps.maxPrizePerPlaceXlm) && prizeStroops > xlmToStroops(caps.maxPrizePerPlaceXlm))
    return `Limit: at most ${caps.maxPrizePerPlaceXlm} XLM per claim.`;
  const total = prizeStroops * BigInt(maxClaims);
  if (Number.isFinite(caps.maxTotalPrizeXlm) && total > xlmToStroops(caps.maxTotalPrizeXlm))
    return `Limit: at most ${caps.maxTotalPrizeXlm} XLM in total per chest (you set ${stroopsToXlm(total)} XLM).`;
  return null;
}

/** Paso "Reward": solo el tope por claim (el total depende de los claims, que se eligen en el paso siguiente). */
export function perClaimError(prizeStroops: bigint, caps: Caps): string | null {
  if (Number.isFinite(caps.maxPrizePerPlaceXlm) && prizeStroops > xlmToStroops(caps.maxPrizePerPlaceXlm))
    return `Limit: at most ${caps.maxPrizePerPlaceXlm} XLM per claim.`;
  return null;
}

/** Claims por defecto válidos: como mucho floor(tope total / premio) (mínimo 1). Sin tope no cambia nada. */
export function clampClaims(prizeStroops: bigint, claims: number, caps: Caps): number {
  if (!Number.isFinite(caps.maxTotalPrizeXlm) || prizeStroops <= BigInt(0)) return claims;
  const fit = Number(xlmToStroops(caps.maxTotalPrizeXlm) / prizeStroops);
  return Math.max(1, Math.min(claims, fit));
}

/** Pista junto al campo de claims (solo hay texto si hay topes, o sea en mainnet). */
export function capHint(caps: Caps): string | null {
  if (!Number.isFinite(caps.maxTotalPrizeXlm) && !Number.isFinite(caps.maxPrizePerPlaceXlm)) return null;
  const parts = [
    Number.isFinite(caps.maxTotalPrizeXlm) ? `up to ${caps.maxTotalPrizeXlm} XLM total` : null,
    Number.isFinite(caps.maxPrizePerPlaceXlm) ? `${caps.maxPrizePerPlaceXlm} XLM per claim` : null,
  ].filter(Boolean);
  return `Limits: ${parts.join(" · ")}`;
}
