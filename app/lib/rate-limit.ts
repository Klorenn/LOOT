import type { NextRequest } from "next/server";

/**
 * Límites en memoria (por instancia serverless): freno barato contra abuso del relayer.
 * No es global entre instancias: en producción sumar una regla de Vercel Firewall (ver docs/MAINNET.md).
 */
const hits = new Map<string, number[]>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

/** true = permitido (y cuenta el hit). */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

/**
 * Por IP y global para un endpoint que paga fees. Mainnet es estricto (10/min por IP, 120 global);
 * testnet es amable con demos (60/min por IP: una sala de jueces detrás de una IP no se bloquea).
 */
export function relayLimit(req: NextRequest, scope: string, net: string): "ip" | "global" | null {
  const mainnet = net === "mainnet";
  const perIp = mainnet ? num(process.env.RELAY_RATE_PER_IP_PER_MIN_MAINNET, 10) : num(process.env.RELAY_RATE_PER_IP_PER_MIN, 60);
  const global = mainnet ? num(process.env.RELAY_RATE_GLOBAL_PER_MIN_MAINNET, 120) : num(process.env.RELAY_RATE_GLOBAL_PER_MIN, 600);
  scope = `${net}:${scope}`; // contadores separados por red
  if (!allow(`${scope}:ip:${clientIp(req)}`, perIp, 60_000)) return "ip";
  if (!allow(`${scope}:global`, global, 60_000)) return "global";
  return null;
}
