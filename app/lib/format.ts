/** CABC…WXYZ */
export function shortAddr(a: string, edge = 4): string {
  return a.length > edge * 2 + 1 ? `${a.slice(0, edge)}…${a.slice(-edge)}` : a;
}

/** Explorer de la red activa (`NETWORK.explorerUrl` de useNet()/cfg()). */
export const expertTx = (explorerUrl: string, hash: string) => `${explorerUrl}/tx/${hash}`;

/** Cuentas C… son contratos en stellar.expert; las G… son cuentas. */
export const expertAddress = (explorerUrl: string, a: string) =>
  `${explorerUrl}/${a.startsWith("C") ? "contract" : "account"}/${a}`;
