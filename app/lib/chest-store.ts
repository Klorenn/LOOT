import { promises as fs } from "fs";
import path from "path";
import { del, get, list, put } from "@vercel/blob";
import type { Quiz } from "./quiz";

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
  /** Cofre legacy (contrato registry): id numérico. */
  id?: number;
  /** Cofre de la factory: dirección del contrato. Exactamente uno de id/address. */
  address?: string;
  template?: string;
  question: string;
  hint?: string;
  difficulty?: 1 | 2 | 3 | 4;
  /** Cofre cuestionario: solo preguntas y opciones públicas, nunca las respuestas (ver lib/quiz.ts). */
  quiz?: Quiz;
  /** Solo en cofres públicos: hace falta para armar la prueba. Los privados viajan en #s= del link. */
  salt?: string;
  /** false = cofre privado: no aparece en /explore y su sal no se guarda. Ausente = legado (público). */
  listed?: boolean;
  fingerprintHex: string;
  prize: number;
  maxClaims: number;
  creator?: string;
  txHash?: string;
  createdAt: string;
};

export type PendingMeta = Omit<ChestMeta, "id" | "address" | "createdAt" | "txHash"> & {
  creator: string;
  reservedAt: string;
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Chest metadata storage is not configured (connect a Vercel Blob store or set LOOT_READ_WRITE_TOKEN).");
    this.name = "StorageNotConfiguredError";
  }
}

const FILE = path.join(process.cwd(), "data", "chests.json");
const PENDING_FILE = path.join(process.cwd(), "data", "pending.json");

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
  return (await fileReadAll<ChestMeta>(FILE))[String(id)] ?? null;
}

/** Clave de Blob: legacy en chests/<id>, factory en factory/<address> (prefijo aparte: main no lo lista). */
const metaKey = (k: number | string) => (typeof k === "number" ? `chests/${k}.json` : `factory/${k}.json`);
const fileKey = (k: number | string) => String(k);

export async function getChestMeta(key: number | string): Promise<ChestMeta | null> {
  if (hasBlob()) {
    const m = await blobRead<ChestMeta>(metaKey(key));
    if (m) return m;
  }
  if (typeof key === "string") return (await fileReadAll<ChestMeta>(FILE))[key] ?? null;
  return readLegacyFile(key); // legado / dev local (en Vercel el archivo no existe: null)
}

/** Reserva (write-once) los metadatos de un cofre por su huella, antes de crearlo on-chain. */
export async function reserveChestMeta(p: PendingMeta): Promise<"ok" | "exists"> {
  if (backend() === "blob") return blobWriteOnce(`pending/${p.fingerprintHex}.json`, p);
  const all = await fileReadAll<PendingMeta>(PENDING_FILE);
  if (all[p.fingerprintHex]) return "exists";
  all[p.fingerprintHex] = p;
  await fileWriteAll(PENDING_FILE, all);
  return "ok";
}

/** Sustituye una reserva existente (solo la llama la ruta tras comprobar que no hay cofre con esa huella). */
export async function replacePendingMeta(p: PendingMeta): Promise<void> {
  if (backend() === "blob") {
    await put(`pending/${p.fingerprintHex}.json`, JSON.stringify(p), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ...auth(),
    });
    return;
  }
  const all = await fileReadAll<PendingMeta>(PENDING_FILE);
  all[p.fingerprintHex] = p;
  await fileWriteAll(PENDING_FILE, all);
}

export async function getPending(fingerprintHex: string): Promise<PendingMeta | null> {
  if (backend() === "blob") return blobRead<PendingMeta>(`pending/${fingerprintHex}.json`);
  return (await fileReadAll<PendingMeta>(PENDING_FILE))[fingerprintHex] ?? null;
}

/** Publica (write-once) los metadatos definitivos por id/dirección de cofre. Devuelve los que queden guardados. */
export async function saveChestMeta(meta: ChestMeta): Promise<ChestMeta> {
  const key = (meta.address ?? meta.id) as number | string;
  if (backend() === "blob") {
    const r = await blobWriteOnce(metaKey(key), meta);
    if (r === "exists") return (await blobRead<ChestMeta>(metaKey(key))) ?? meta;
    await del(`pending/${meta.fingerprintHex}.json`, auth()).catch(() => {});
    return meta;
  }
  const all = await fileReadAll<ChestMeta>(FILE);
  if (all[fileKey(key)]) return all[fileKey(key)];
  all[fileKey(key)] = meta;
  await fileWriteAll(FILE, all);
  const pend = await fileReadAll<PendingMeta>(PENDING_FILE);
  delete pend[meta.fingerprintHex];
  await fileWriteAll(PENDING_FILE, pend);
  return meta;
}

let publicCache: { at: number; value: ChestMeta[] } | null = null;

/** Metadatos de cofres públicos (listed !== false), de Blob o del archivo local. */
export async function listPublicMetas(): Promise<ChestMeta[]> {
  if (publicCache && Date.now() - publicCache.at < 30_000) return publicCache.value;
  let metas: ChestMeta[] = Object.values(await fileReadAll<ChestMeta>(FILE));
  if (hasBlob()) {
    const [a, b] = await Promise.all([
      list({ prefix: "chests/", limit: 500, ...auth() }),
      list({ prefix: "factory/", limit: 500, ...auth() }),
    ]);
    const fetched = await Promise.all([...a.blobs, ...b.blobs].map((x) => blobRead<ChestMeta>(x.pathname)));
    const byKey = new Map(metas.map((m) => [m.address ?? m.id, m]));
    for (const m of fetched) if (m) byKey.set(m.address ?? m.id, m);
    metas = [...byKey.values()];
  }
  const value = metas
    .filter((m) => m.listed !== false)
    .sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
  publicCache = { at: Date.now(), value };
  return value;
}

/** @deprecated usar listPublicMetas */
export const listChests = listPublicMetas;
