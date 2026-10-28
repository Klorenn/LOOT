import { promises as fs } from "fs";
import path from "path";
import { del, get, list, put } from "@vercel/blob";
import { cfg } from "./cfg";
import type { Quiz } from "./quiz";
import { decideSetClaim, type SetClaimMarker, type SetHeader, type SetRef } from "./chest-set";

/**
 * Metadatos off-chain de los cofres (pregunta, pista, dificultad y, solo si el cofre es público, la sal).
 *
 * Almacenamiento:
 *  - Producción (Vercel): Vercel Blob (BLOB_READ_WRITE_TOKEN). Si falta el token se falla con un
 *    error claro; nunca se escribe a disco en Vercel (el FS es efímero).
 *  - Desarrollo local sin token: data/chests.json y data/pending.json (ignorados por git).
 *
 * Anti-secuestro: los metadatos se RESERVAN antes de crear el cofre, indexados por su huella
 * (que solo conoce el creador hasta que el cofre existe on-chain) y se confirman después
 * comprobando contra la cadena (huella + creador). Todo es write-once.
 */

export type ChestMeta = {
  id: number;
  template?: string;
  question: string;
  hint?: string;
  difficulty?: 1 | 2 | 3 | 4;
  /** Cofre cuestionario: solo preguntas y opciones públicas, nunca las respuestas (ver lib/quiz.ts). */
  quiz?: Quiz;
  /** Member of a chest set (lib/chest-set.ts): one chest per question, max_claims = 1. */
  set?: SetRef;
  /** Solo en cofres públicos: hace falta para armar la prueba. Los privados viajan en #s= del link. */
  salt?: string;
  /** How the answer becomes answer_field (lib/kdf.ts). Absent = "v1" (all older chests). Registry v2 testnet only. */
  kdf?: "argon2id-v1";
  /** false = cofre privado: no aparece en /explore y su sal no se guarda. Ausente = legado (público). */
  listed?: boolean;
  fingerprintHex: string;
  prize: number;
  maxClaims: number;
  creator?: string;
  txHash?: string;
  createdAt: string;
};

export type PendingMeta = Omit<ChestMeta, "id" | "createdAt" | "txHash"> & {
  creator: string;
  reservedAt: string;
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Chest metadata storage is not configured (connect a Vercel Blob store or set LOOT_READ_WRITE_TOKEN).");
    this.name = "StorageNotConfiguredError";
  }
}

/**
 * Namespace por red. Testnet conserva sus claves de siempre (chests/<id>.json, pending/<huella>.json,
 * data/chests.json) sin migración; mainnet vive bajo mainnet/… y data/mainnet-….json, sin tocar las anteriores.
 */
async function ns() {
  const { IS_MAINNET } = await cfg();
  return {
    net: IS_MAINNET ? "mainnet" : "testnet",
    chests: IS_MAINNET ? "mainnet/chests/" : "chests/",
    pending: IS_MAINNET ? "mainnet/pending/" : "pending/",
    sets: IS_MAINNET ? "mainnet/sets/" : "sets/",
    setsFile: path.join(process.cwd(), "data", IS_MAINNET ? "mainnet-sets.json" : "sets.json"),
    file: path.join(process.cwd(), "data", IS_MAINNET ? "mainnet-chests.json" : "chests.json"),
    pendingFile: path.join(process.cwd(), "data", IS_MAINNET ? "mainnet-pending.json" : "pending.json"),
  };
}

type Backend = "blob" | "file";
/** Blob credentials: a read-write token, or a connected store via Vercel OIDC (BLOB_STORE_ID + VERCEL_OIDC_TOKEN). */
function hasBlob(): boolean {
  return Boolean(
    process.env.LOOT_READ_WRITE_TOKEN ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)),
  );
}
function backend(): Backend {
  if (hasBlob()) return "blob";
  if (process.env.VERCEL) throw new StorageNotConfiguredError();
  return "file";
}

// ---------- Blob ----------
// El store es PRIVADO: los metadatos (y la sal de cofres públicos) solo se sirven vía nuestra API.
// The SDK prefers Vercel OIDC + BLOB_STORE_ID over BLOB_READ_WRITE_TOKEN; a stale store id from an
// integration then yields "Access denied". Passing the token explicitly makes it win.
const blobToken = () => process.env.LOOT_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const auth = () => {
  const token = blobToken();
  return token ? { token } : {};
};

async function blobRead<T>(key: string): Promise<T | null> {
  const r = await get(key, { access: "private", useCache: false, ...auth() }).catch(() => null);
  if (!r || r.statusCode !== 200) return null;
  return (await new Response(r.stream).json().catch(() => null)) as T | null;
}

/** "ok" si se escribió; "exists" si la clave ya existía (write-once). */
async function blobWriteOnce(key: string, value: unknown): Promise<"ok" | "exists"> {
  try {
    await put(key, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      ...auth(),
    });
    return "ok";
  } catch (e) {
    if (/already exists|BlobAlreadyExists/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`))
      return "exists";
    throw e;
  }
}

// ---------- Archivo (solo dev local) ----------
async function fileReadAll<T>(file: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}
async function fileWriteAll(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// ---------- API ----------
async function readLegacyFile(id: number): Promise<ChestMeta | null> {
  return (await fileReadAll<ChestMeta>((await ns()).file))[String(id)] ?? null;
}

export async function getChestMeta(id: number): Promise<ChestMeta | null> {
  const n = await ns();
  if (hasBlob()) {
    const m = await blobRead<ChestMeta>(`${n.chests}${id}.json`);
    if (m) return m;
  }
  return readLegacyFile(id); // legado / dev local (en Vercel el archivo no existe: null)
}

/** Reserva (write-once) los metadatos de un cofre por su huella, antes de crearlo on-chain. */
export async function reserveChestMeta(p: PendingMeta): Promise<"ok" | "exists"> {
  const n = await ns();
  if (backend() === "blob") return blobWriteOnce(`${n.pending}${p.fingerprintHex}.json`, p);
  const all = await fileReadAll<PendingMeta>(n.pendingFile);
  if (all[p.fingerprintHex]) return "exists";
  all[p.fingerprintHex] = p;
  await fileWriteAll(n.pendingFile, all);
  return "ok";
}

export async function getPending(fingerprintHex: string): Promise<PendingMeta | null> {
  const n = await ns();
  if (backend() === "blob") return blobRead<PendingMeta>(`${n.pending}${fingerprintHex}.json`);
  return (await fileReadAll<PendingMeta>(n.pendingFile))[fingerprintHex] ?? null;
}

/** Publica (write-once) los metadatos definitivos por id de cofre. Devuelve los que queden guardados. */
export async function saveChestMeta(meta: ChestMeta): Promise<ChestMeta> {
  const n = await ns();
  if (backend() === "blob") {
    const r = await blobWriteOnce(`${n.chests}${meta.id}.json`, meta);
    if (r === "exists") return (await blobRead<ChestMeta>(`${n.chests}${meta.id}.json`)) ?? meta;
    await del(`${n.pending}${meta.fingerprintHex}.json`, auth()).catch(() => {});
    return meta;
  }
  const all = await fileReadAll<ChestMeta>(n.file);
  if (all[String(meta.id)]) return all[String(meta.id)];
  all[String(meta.id)] = meta;
  await fileWriteAll(n.file, all);
  const pend = await fileReadAll<PendingMeta>(n.pendingFile);
  delete pend[meta.fingerprintHex];
  await fileWriteAll(n.pendingFile, pend);
  return meta;
}

const publicCache = new Map<string, { at: number; value: ChestMeta[] }>();

/** Metadatos de cofres públicos (listed !== false), de Blob o del archivo local. */
export async function listPublicMetas(): Promise<ChestMeta[]> {
  const n = await ns();
  const hit = publicCache.get(n.net);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  let metas: ChestMeta[] = Object.values(await fileReadAll<ChestMeta>(n.file));
  if (hasBlob()) {
    const { blobs } = await list({ prefix: n.chests, limit: 500, ...auth() });
    const fetched = await Promise.all(blobs.map((b) => blobRead<ChestMeta>(b.pathname)));
    const byId = new Map(metas.map((m) => [m.id, m]));
    for (const m of fetched) if (m) byId.set(m.id, m);
    metas = [...byId.values()];
  }
  const value = metas.filter((m) => m.listed !== false).sort((a, b) => b.id - a.id);
  publicCache.set(n.net, { at: Date.now(), value });
  return value;
}

/** @deprecated usar listPublicMetas */
export const listChests = listPublicMetas;

// ---------- Chest sets (lib/chest-set.ts) ----------
// Everything is write-once, keyed by the set id (= chest id of question 1):
//   <id>/set.json            header (created when question 1 is confirmed)
//   <id>/m/<index>.json      { chestId } for each question that was created
//   <id>/c/<recipient>.json  { chestId } marker for "one Loot per account per set".
// That marker is OFF-CHAIN: it only binds callers of OUR /api/claim relayer. It does not stop a
// second account (sybil) nor a direct contract call. On-chain enforcement is a separate contract change.

async function setKvWriteOnce(key: string, value: unknown): Promise<"ok" | "exists"> {
  const n = await ns();
  if (backend() === "blob") return blobWriteOnce(`${n.sets}${key}`, value);
  const all = await fileReadAll<unknown>(n.setsFile);
  if (key in all) return "exists";
  all[key] = value;
  await fileWriteAll(n.setsFile, all);
  return "ok";
}

async function setKvRead<T>(key: string): Promise<T | null> {
  const n = await ns();
  if (hasBlob()) return blobRead<T>(`${n.sets}${key}`);
  return ((await fileReadAll<T>(n.setsFile))[key] as T | undefined) ?? null;
}

async function setKvDelete(key: string): Promise<void> {
  const n = await ns();
  if (backend() === "blob") {
    await del(`${n.sets}${key}`, auth()).catch(() => {});
    return;
  }
  const all = await fileReadAll<unknown>(n.setsFile);
  delete all[key];
  await fileWriteAll(n.setsFile, all);
}

export const saveSetHeader = (h: SetHeader) => setKvWriteOnce(`${h.id}/set.json`, h);
export const getSetHeader = (id: number) => setKvRead<SetHeader>(`${id}/set.json`);

/** Records which chest is question `index` of the set. "exists" = already recorded (read it to compare). */
export const saveSetMember = (setId: number, index: number, chestId: number) =>
  setKvWriteOnce(`${setId}/m/${index}.json`, { chestId });

/** Frees a question slot (only used to roll back a member that failed the set total cap). */
export const deleteSetMember = (setId: number, index: number) => setKvDelete(`${setId}/m/${index}.json`);

export async function getSetMember(setId: number, index: number): Promise<number | null> {
  const m = await setKvRead<{ chestId: number }>(`${setId}/m/${index}.json`);
  return m && Number.isSafeInteger(m.chestId) ? m.chestId : null;
}

/** Chest ids by question index; questions that were never created are absent. */
export async function getSetMembers(setId: number, size: number): Promise<Map<number, number>> {
  const ids = await Promise.all(Array.from({ length: size }, (_, i) => getSetMember(setId, i)));
  const out = new Map<number, number>();
  ids.forEach((id, i) => {
    if (id !== null) out.set(i, id);
  });
  return out;
}

export type SetClaimReservation =
  | { ok: true; /** undo the reservation if the claim then fails (no-op for a same-chest retry) */ release: () => Promise<void> }
  | { ok: false };

/**
 * Atomically reserves the account's single claim in this set (write-once marker) BEFORE the relayer
 * sends anything. Same chest again = retry, allowed. Another chest of the set = refused.
 */
export async function reserveSetClaim(setId: number, recipient: string, chestId: number): Promise<SetClaimReservation> {
  const key = `${setId}/c/${recipient}.json`;
  const r = await setKvWriteOnce(key, { chestId } satisfies SetClaimMarker);
  if (r === "ok") return { ok: true, release: () => setKvDelete(key) };
  const existing = await setKvRead<SetClaimMarker>(key);
  // The marker exists but couldn't be read (storage hiccup): fail closed, never let a second claim through.
  if (!existing) return { ok: false };
  const d = decideSetClaim(existing, chestId);
  return d === "refuse" ? { ok: false } : { ok: true, release: async () => {} };
}

/** Chest the account already claimed in this set (for UI hints), or null. */
export async function getSetClaim(setId: number, recipient: string): Promise<number | null> {
  const m = await setKvRead<SetClaimMarker>(`${setId}/c/${recipient}.json`);
  return m && Number.isSafeInteger(m.chestId) ? m.chestId : null;
}
