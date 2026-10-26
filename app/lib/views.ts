import { type ChestRef, encodeRef, refPath } from "./chest-code";
import { readChest, type OnChainChest } from "./chain";
import { getChestMeta, type ChestMeta } from "./chest-store";
import { DEMO_CHEST, stroopsToXlm, tokenDecimals, tokenLabel, PRIZE } from "./config";
import { factoryAddressAt, factoryIndexOf, readFactoryChest, type FactoryChest } from "./factory";
import { getChest as demoCatalog } from "./chests-demo";
import type { Quiz } from "./quiz";

/**
 * Vista unificada de un cofre (legacy o factory) para la UI. Solo servidor:
 * mezcla cadena + metadatos off-chain (Blob) + catálogo del demo.
 */

export type ChestStatus = "open" | "claimed" | "expired";

export type ChestView = {
  kind: "legacy" | "factory";
  code: string;
  href: string;
  /** legacy: id del registry */
  id?: number;
  /** factory: dirección del contrato */
  address?: string;
  question: string;
  hint?: string;
  difficulty?: 1 | 2 | 3 | 4;
  /** Cofre cuestionario: preguntas y opciones públicas (nunca las respuestas). */
  quiz?: Quiz;
  creator: string;
  fingerprintHex: string;
  /** Solo cofres públicos (o sin metadatos: sal derivada de la pregunta). Los privados no la tienen. */
  salt?: string;
  saltRequired?: boolean;
  /** sin metadatos: la sal puede ser la derivada de la pregunta (cofres de SDK) */
  saltDerivable?: boolean;
  /** premio por lugar en orden de reclamo (XLM) */
  prizes: string[];
  maxClaims: number;
  claims: number;
  closed: boolean;
  /** unix s; 0 = sin vencimiento */
  deadline: number;
  prizeLabel: string;
  prizeStroops: string;
  token: string;
  nextPlace: { place: number; amountXlm: string } | null;
  /** premio aún sin reclamar (stroops); 0 si está cerrado */
  poolStroops: string;
  /** factory: prize_pool + fee_reserve en stroops (tope de lo que devuelve close) */
  refundStroops?: string;
  listed?: boolean;
};

export function statusOf(
  v: { closed: boolean; claims: number; maxClaims: number; deadline: number },
  nowSec = Math.floor(Date.now() / 1000),
): ChestStatus {
  if (v.closed || v.claims >= v.maxClaims) return "claimed";
  if (v.deadline && v.deadline < nowSec) return "expired";
  return "open";
}

const fmt = (n: bigint) => stroopsToXlm(n);

export function factoryView(c: FactoryChest, meta: ChestMeta | null): ChestView {
  const code = encodeRef({ kind: "factory", index: c.index });
  const total = c.prizes.reduce((a, b) => a + b, BigInt(0));
  const isDemo = c.address === DEMO_CHEST.address;
  const priv = meta?.listed === false;
  return {
    kind: "factory",
    code,
    href: refPath({ kind: "factory", index: c.index }),
    address: c.address,
    question: c.question,
    hint: isDemo ? DEMO_CHEST.hint : meta?.hint,
    difficulty: isDemo ? 3 : meta?.difficulty,
    quiz: isDemo ? undefined : meta?.quiz,
    creator: c.creator,
    fingerprintHex: c.fingerprintHex,
    // Sin metadatos no se sirve ninguna sal: el cliente prueba la derivada de la pregunta (cofres de
    // SDK) y, si la huella no coincide, pide el link con #s=. Con metadatos privados, nunca hay sal.
    salt: isDemo ? DEMO_CHEST.salt : priv ? undefined : meta?.salt,
    saltRequired: priv || undefined,
    saltDerivable: !isDemo && !meta ? true : undefined,
    prizes: c.prizes.map(fmt),
    maxClaims: c.slots,
    claims: c.claims,
    closed: c.closed,
    deadline: c.expiry,
    prizeLabel: `${fmt(total)} ${PRIZE.code}`,
    prizeStroops: total.toString(),
    token: c.token,
    nextPlace:
      c.closed || c.claims >= c.slots
        ? null
        : { place: c.claims + 1, amountXlm: fmt(c.prizes[c.claims]) },
    poolStroops: c.prizePool.toString(),
    refundStroops: (c.prizePool + c.feeReserve).toString(),
    listed: meta ? meta.listed !== false : undefined,
  };
}

export function legacyView(c: OnChainChest, meta: ChestMeta | null): ChestView {
  const demo = demoCatalog(c.id);
  const isDemo = !!DEMO_CHEST.id && c.id === DEMO_CHEST.id && !DEMO_CHEST.address;
  const unit = tokenDecimals(c.token);
  const amount = stroopsToXlm(c.prize, unit);
  const priv = meta?.listed === false;
  return {
    kind: "legacy",
    code: encodeRef({ kind: "legacy", id: c.id }),
    href: refPath({ kind: "legacy", id: c.id }),
    id: c.id,
    question: isDemo ? DEMO_CHEST.question : (meta?.question ?? demo?.question ?? "—"),
    hint: isDemo ? DEMO_CHEST.hint : meta?.hint,
    difficulty: isDemo ? 3 : (meta?.difficulty ?? demo?.difficulty),
    quiz: isDemo ? undefined : meta?.quiz,
    creator: c.creator,
    fingerprintHex: c.fingerprintHex,
    salt: isDemo ? DEMO_CHEST.salt : priv ? undefined : (meta?.salt ?? demo?.salt),
    saltRequired: priv || undefined,
    prizes: Array.from({ length: c.maxClaims }, () => amount),
    maxClaims: c.maxClaims,
    claims: c.claims,
    closed: c.closed,
    deadline: c.deadline,
    prizeLabel: `${amount} ${tokenLabel(c.token)}`,
    prizeStroops: c.prize.toString(),
    poolStroops: c.closed
      ? "0"
      : (c.prize * BigInt(Math.max(0, c.maxClaims - c.claims))).toString(),
    token: c.token,
    nextPlace:
      c.closed || c.claims >= c.maxClaims ? null : { place: c.claims + 1, amountXlm: amount },
    listed: meta ? meta.listed !== false : undefined,
  };
}

const isMissing = (e: unknown) =>
  /Error\(Contract,\s*#1\)|ChestNotFound|does not exist|MissingValue|non-existent/i.test(
    (e as { message?: string })?.message ?? String(e),
  );

/** Vista de un cofre por referencia. null = no existe. Lanza si la cadena no responde. */
export async function chestView(ref: ChestRef): Promise<ChestView | null> {
  if (ref.kind === "factory") {
    const address = await factoryAddressAt(ref.index);
    if (!address) return null;
    const [chain, meta] = await Promise.all([
      readFactoryChest(address, ref.index),
      getChestMeta(address).catch(() => null),
    ]);
    return factoryView(chain, meta);
  }
  try {
    const [chain, meta] = await Promise.all([
      readChest(ref.id),
      getChestMeta(ref.id).catch(() => null),
    ]);
    // legacy sin metadatos ni catálogo: no se inventa nada
    if (!meta && !demoCatalog(ref.id) && ref.id !== DEMO_CHEST.id) return null;
    return legacyView(chain, meta);
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

/** Posición en la factory de un contrato (para mapear direcciones a rutas), o null. */
export { factoryIndexOf };
