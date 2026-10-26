"use client";

import { clientCfg, type NetConfig } from "./network";

/**
 * Atajos para la lib SOLO de navegador (send, wallet, create-chest…): `NETWORK.x` y `CONTRACTS.x` se
 * resuelven al ACCEDER (cookie `loot_net` en el momento), nunca al importar el módulo.
 */
const lazy = <K extends keyof NetConfig>(key: K): NetConfig[K] =>
  new Proxy({} as object, {
    get: (_t, prop) => (clientCfg()[key] as unknown as Record<string | symbol, unknown>)[prop],
    has: (_t, prop) => prop in (clientCfg()[key] as object),
    ownKeys: () => Reflect.ownKeys(clientCfg()[key] as object),
    getOwnPropertyDescriptor: (_t, prop) => ({ enumerable: true, configurable: true, value: (clientCfg()[key] as never)[prop] }),
  }) as NetConfig[K];

export const NETWORK = lazy("NETWORK");
export const CONTRACTS = lazy("CONTRACTS");
export const isMainnet = () => clientCfg().IS_MAINNET;
