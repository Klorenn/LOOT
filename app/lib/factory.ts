import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { simulateRead } from "./chain";
import { FACTORY, PRIZE, stroopsToXlm } from "./config";

/**
 * Factory: un contrato por cofre. Lecturas (server o browser), cotización y argumentos de
 * `create_chest`. Espejo de contracts/factory y de packages/sdk (quoteCreate/resolvePrizes).
 * Las escrituras las firma el creador (lib/create-chest.ts).
 */

export type FactoryChest = {
  address: string;
  /** posición en list_chests */
  index: number;
  creator: string;
  question: string;
  fingerprintHex: string;
  token: string;
  /** premios por lugar en orden de reclamo (stroops) */
  prizes: bigint[];
  slots: number;
  /** reclamos hechos == próximo lugar (0-based) */
  claims: number;
  /** unix s */
  expiry: number;
  closed: boolean;
  dailyFeeBps: number;
  lastFeeTs: number;
  prizePool: bigint;
  feeReserve: bigint;
};

const u32 = (n: number) => nativeToScVal(n, { type: "u32" });

export async function factoryCount(): Promise<number> {
  return Number(await simulateRead(FACTORY.contract, "chest_count", []));
}

export async function factoryAddresses(start: number, limit: number): Promise<string[]> {
  const r = (await simulateRead(FACTORY.contract, "list_chests", [u32(start), u32(limit)])) as unknown[];
  return r.map(String);
}

export async function readFactoryChest(address: string, index = -1): Promise<FactoryChest> {
  const i = (await simulateRead(address, "get_info", [])) as Record<string, unknown>;
  return {
    address,
    index,
    creator: String(i.creator),
    question: String(i.question),
    fingerprintHex: Buffer.from(i.fingerprint as Uint8Array).toString("hex"),
    token: String(i.token),
    prizes: (i.prizes as unknown[]).map((x) => BigInt(x as bigint)),
    slots: Number(i.slots),
    claims: Number(i.claims),
    expiry: Number(i.expiry as bigint),
    closed: Boolean(i.closed),
    dailyFeeBps: Number(i.daily_fee_bps),
    lastFeeTs: Number(i.last_fee_ts as bigint),
    prizePool: BigInt(i.prize_pool as bigint),
    feeReserve: BigInt(i.fee_reserve as bigint),
  };
}

// ---------------------------------------------------------------- cotización

export type Quote = {
  prizes: bigint[];
  prize: bigint;
  creationFee: bigint;
  /** reserva prepago exacta = premio × bps/10000 × días; lo no usado se devuelve al cerrar */
  reserve: bigint;
  /** fee de red estimado (simulación o fallback); lo paga el creador solo en cuentas G */
  network: bigint;
  /** premio + creación + reserva (lo que sale de la cuenta hacia contratos) */
  funded: bigint;
  /** funded + red */
  total: bigint;
  days: number;
};

export const FALLBACK_NETWORK_STROOPS = BigInt(5_000_000); // 0,5 XLM

export function quoteLocal(prizes: bigint[], days: number, network = FALLBACK_NETWORK_STROOPS): Quote {
  const prize = prizes.reduce((a, b) => a + b, BigInt(0));
  const reserve = (prize * BigInt(FACTORY.dailyFeeBps) * BigInt(days)) / BigInt(10_000);
  const funded = prize + FACTORY.creationFeeStroops + reserve;
  return { prizes, prize, creationFee: FACTORY.creationFeeStroops, reserve, network, funded, total: funded + network, days };
}

/** Valida el calendario: 1..50 lugares, todos > 0. Devuelve un mensaje o null. */
export function scheduleError(prizes: bigint[]): string | null {
  if (prizes.length < 1) return "Add at least one place.";
  if (prizes.length > FACTORY.maxPlaces) return `At most ${FACTORY.maxPlaces} places.`;
  if (prizes.some((p) => p <= BigInt(0))) return "Every place needs a prize above 0.";
  return null;
}

/** Podio 50/30/20 sobre un total (el resto del redondeo va al 1.º). */
export function podium(total: bigint): bigint[] {
  const second = (total * BigInt(30)) / BigInt(100);
  const third = (total * BigInt(20)) / BigInt(100);
  return [total - second - third, second, third];
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function createArgs(
  creator: string,
  question: string,
  fingerprintHex: string,
  prizes: bigint[],
  days: number,
): xdr.ScVal[] {
  return [
    Address.fromString(creator).toScVal(),
    nativeToScVal(question, { type: "string" }),
    xdr.ScVal.scvBytes(Buffer.from(fingerprintHex, "hex")),
    xdr.ScVal.scvVec(prizes.map((p) => nativeToScVal(p, { type: "i128" }))),
    u32(days),
  ];
}

/** "100 XLM" o "50 / 30 / 20 XLM" para listados. */
export function prizeSummary(prizes: bigint[]): string {
  const sum = prizes.reduce((a, b) => a + b, BigInt(0));
  if (prizes.length === 1 || prizes.every((p) => p === prizes[0])) {
    return prizes.length === 1
      ? `${stroopsToXlm(sum)} ${PRIZE.code}`
      : `${stroopsToXlm(sum)} ${PRIZE.code}`;
  }
  return `${stroopsToXlm(sum)} ${PRIZE.code}`;
}

// ------------------------------------------------- índice dirección <-> posición

/** list_chests es append-only: una posición nunca cambia, así que se cachea para siempre. */
const addrAt = new Map<number, string>();
const idxOf = new Map<string, number>();
let countCache: { at: number; n: number } | null = null;

function remember(start: number, list: string[]) {
  list.forEach((a, i) => {
    addrAt.set(start + i, a);
    idxOf.set(a, start + i);
  });
}

/** Cuenta de cofres con caché corto (los nuevos aparecen en ≤ ttl). */
export async function cachedFactoryCount(ttlMs = 10_000): Promise<number> {
  if (countCache && Date.now() - countCache.at < ttlMs) return countCache.n;
  const n = await factoryCount();
  countCache = { at: Date.now(), n };
  return n;
}

/** Todas las direcciones (posición = índice). Solo pide las que no conoce. */
export async function allFactoryAddresses(fresh = false): Promise<string[]> {
  const n = await cachedFactoryCount(fresh ? 0 : 10_000);
  let from = 0;
  while (from < n && addrAt.has(from)) from++;
  for (let start = from; start < n; start += 50) {
    remember(start, await factoryAddresses(start, Math.min(50, n - start)));
  }
  return Array.from({ length: n }, (_, i) => addrAt.get(i)!);
}

export async function factoryAddressAt(index: number): Promise<string | null> {
  if (addrAt.has(index)) return addrAt.get(index)!;
  const all = await allFactoryAddresses(true);
  return all[index] ?? null;
}

/** Posición de un contrato en la factory, o null si no lo creó la factory. */
export async function factoryIndexOf(address: string): Promise<number | null> {
  if (idxOf.has(address)) return idxOf.get(address)!;
  await allFactoryAddresses(true);
  return idxOf.get(address) ?? null;
}
