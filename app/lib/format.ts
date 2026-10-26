import { NETWORK } from "./config";

/** CABC…WXYZ */
export function shortAddr(a: string, edge = 4): string {
  return a.length > edge * 2 + 1 ? `${a.slice(0, edge)}…${a.slice(-edge)}` : a;
}

/** Explorer según la red configurada (lib/config.ts). */
export const EXPERT = NETWORK.explorerUrl;

export const expertTx = (hash: string) => `${EXPERT}/tx/${hash}`;

/** Cuentas C… son contratos en stellar.expert; las G… son cuentas. */
export const expertAddress = (a: string) =>
  `${EXPERT}/${a.startsWith("C") ? "contract" : "account"}/${a}`;
