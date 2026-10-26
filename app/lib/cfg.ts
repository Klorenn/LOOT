import { clientCfg, configFor, effectiveNet, mainnetPublic, mainnetPublicFromEnv, type Net, type NetConfig } from "./network";

/**
 * Config de la red de la PETICIÓN (cookie `loot_net`), isomórfica y asíncrona.
 *  - navegador: cookie del documento;
 *  - servidor: el resolver que registra instrumentation.ts (lee la cookie con next/headers; no se importa
 *    aquí para no arrastrar next/headers al bundle del cliente).
 * Los secretos por red (RELAYER_SECRET vs RELAYER_SECRET_MAINNET) se eligen con esta config y nunca caen
 * de una red a la otra. Trabajos sin petición (cron) usan cfgFor(net) con la red explícita.
 */
type Resolver = () => Promise<Net | null>;

export async function cfg(): Promise<NetConfig> {
  if (typeof window !== "undefined") return clientCfg();
  const resolve = (globalThis as { __lootServerNet?: Resolver }).__lootServerNet;
  if (!resolve) throw new Error("server network resolver missing (instrumentation.ts did not run)");
  const m = mainnetPublicFromEnv();
  return configFor(effectiveNet(await resolve(), m), m);
}

/** Config de una red concreta (jobs, o cuando la red ya se conoce). */
export function cfgFor(net: Net): NetConfig {
  const m = typeof window === "undefined" ? mainnetPublicFromEnv() : mainnetPublic();
  return configFor(net, m);
}

/** Red de una Request de ruta (sin depender del contexto async). */
export function cfgFromCookieHeader(cookieHeader: string | null | undefined): NetConfig {
  const m = mainnetPublicFromEnv();
  const match = (cookieHeader ?? "").match(/(?:^|;\s*)loot_net=([^;]+)/);
  const v = match?.[1];
  return configFor(effectiveNet(v === "mainnet" || v === "testnet" ? v : null, m), m);
}
