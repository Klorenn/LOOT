/** CABC…WXYZ */
export function shortAddr(a: string, edge = 4): string {
  return a.length > edge * 2 + 1 ? `${a.slice(0, edge)}…${a.slice(-edge)}` : a;
}

/** NEXT_PUBLIC_STELLAR_NETWORK = "public" | "testnet" (por defecto testnet). */
export const EXPLORER_NET =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "public" ? "public" : "testnet";
const EXPERT = `https://stellar.expert/explorer/${EXPLORER_NET}`;

export const expertTx = (hash: string) => `${EXPERT}/tx/${hash}`;

/** Cuentas C… son contratos en stellar.expert; las G… son cuentas. */
export const expertAddress = (a: string) =>
  `${EXPERT}/${a.startsWith("C") ? "contract" : "account"}/${a}`;
