import type { NextRequest } from "next/server";

/**
 * Límite en memoria por clave (best-effort: en serverless cada instancia lleva su propio
 * contador, así que es una barrera contra abuso casual, no una garantía). Devuelve true si
 * hay que rechazar la request.
 */
const buckets = new Map<string, { n: number; at: number }>();

export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.at > windowMs) {
    buckets.set(key, { n: 1, at: now });
    if (buckets.size > 5_000) {
      for (const [k, v] of buckets) if (now - v.at > windowMs) buckets.delete(k);
    }
    return false;
  }
  b.n += 1;
  return b.n > max;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Por IP y global bajo un mismo nombre de ruta. */
export function routeLimited(
  req: NextRequest,
  name: string,
  perIp: number,
  global: number,
  windowMs = 60_000,
): boolean {
  return limited(`${name}:ip:${clientIp(req)}`, perIp, windowMs) || limited(`${name}:all`, global, windowMs);
}
