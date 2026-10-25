import { readChest, readClaimedEvents, type ClaimedEvent, type OnChainChest } from "./chain";
import { chestView, factoryView, legacyView, statusOf, type ChestStatus, type ChestView } from "./views";
import { getChest as demoMeta } from "./chests-demo";
import { getChestMeta, listPublicMetas } from "./chest-store";
import { allFactoryAddresses, readFactoryChest, type FactoryChest } from "./factory";
import { CONTRACTS, DEMO_CHEST, HIDDEN_CHEST_IDS, LISTED_CHEST_IDS, LISTED_FACTORY_ADDRESSES } from "./config";

export { statusOf, type ChestStatus };

/** Solo servidor. Lecturas de cadena con failover (lib/rpc.ts) y caché en memoria de 30 s. */

const TTL = 30_000;
const MAX_SCAN = 300;
const MAX_FACTORY_READ = 80;

let legacyCache: { at: number; value: OnChainChest[] } | null = null;
let factoryCache: { at: number; value: FactoryChest[] } | null = null;
let claimedCache: { at: number; value: ClaimedEvent[] } | null = null;

const isMissing = (e: unknown) =>
  /Error\(Contract,\s*#1\)|ChestNotFound/i.test(
    (e as { message?: string })?.message ?? String(e),
  );

/** Todos los cofres del contrato legacy (ids 1.. hasta el primero que no existe). */
export async function readAllChests(fresh = false): Promise<OnChainChest[]> {
  if (!fresh && legacyCache && Date.now() - legacyCache.at < TTL) return legacyCache.value;
  const out: OnChainChest[] = [];
  const CHUNK = 6;
  for (let start = 1; start <= MAX_SCAN; start += CHUNK) {
    const ids = Array.from({ length: CHUNK }, (_, i) => start + i);
    const res = await Promise.all(
      ids.map((id) =>
        readChest(id).catch((e) => {
          if (isMissing(e)) return null;
          throw e; // RPC caído: no se cachea un listado incompleto
        }),
      ),
    );
    const firstMissing = res.findIndex((r) => r === null);
    for (const r of firstMissing === -1 ? res : res.slice(0, firstMissing)) if (r) out.push(r);
    if (firstMissing !== -1) break;
  }
  legacyCache = { at: Date.now(), value: out };
  return out;
}

/** Los cofres más nuevos de la factory (hasta MAX_FACTORY_READ), con su posición. */
export async function readAllFactory(fresh = false): Promise<FactoryChest[]> {
  if (!fresh && factoryCache && Date.now() - factoryCache.at < TTL) return factoryCache.value;
  const addrs = await allFactoryAddresses(fresh);
  const from = Math.max(0, addrs.length - MAX_FACTORY_READ);
  const idx = Array.from({ length: addrs.length - from }, (_, i) => from + i);
  const out: FactoryChest[] = [];
  const CHUNK = 6;
  for (let i = 0; i < idx.length; i += CHUNK) {
    const part = await Promise.all(
      idx.slice(i, i + CHUNK).map((k) => readFactoryChest(addrs[k], k).catch(() => null)),
    );
    for (const c of part) if (c) out.push(c);
  }
  factoryCache = { at: Date.now(), value: out };
  return out;
}

export async function readClaimedCached(): Promise<ClaimedEvent[]> {
  if (claimedCache && Date.now() - claimedCache.at < TTL) return claimedCache.value;
  const { items } = await readClaimedEvents();
  claimedCache = { at: Date.now(), value: items };
  return items;
}

export type ChestRowData = {
  /** legacy: id; factory: posición en la factory (solo como clave) */
  id: number;
  kind: "legacy" | "factory";
  code: string;
  href: string;
  name: string;
  question: string;
  difficulty: 1 | 2 | 3 | 4 | null;
  status: ChestStatus;
  claims: number;
  maxClaims: number;
  prizeLabel: string;
  prizeStroops: string;
  /** premio por lugar (XLM), orden de reclamo */
  prizes: string[];
  token: string;
  creator: string;
  deadline: number;
  /** factory: tope de lo que devuelve cerrar (premio sin reclamar + reserva de fees) */
  refundStroops: string | null;
  poolStroops: string;
  address: string | null;
};

export function toRowFromView(v: ChestView, index = 0): ChestRowData {
  const demo = v.id !== undefined ? demoMeta(v.id) : undefined;
  const isDemo = v.address ? v.address === DEMO_CHEST.address : false;
  const name =
    demo?.name ??
    (isDemo ? "Who created SCP" : v.question.length > 44 ? `${v.question.slice(0, 43)}…` : v.question);
  return {
    id: v.id ?? index,
    kind: v.kind,
    code: v.code,
    href: v.href,
    name: v.kind === "legacy" && !demo ? `Chest #${String(v.id).padStart(4, "0")}` : name,
    question: v.question,
    difficulty: v.difficulty ?? null,
    status: statusOf(v),
    claims: v.claims,
    maxClaims: v.maxClaims,
    prizeLabel: v.prizeLabel,
    prizeStroops: v.prizeStroops,
    prizes: v.prizes,
    token: v.token,
    creator: v.creator,
    deadline: v.deadline,
    refundStroops: v.refundStroops ?? null,
    poolStroops: v.poolStroops,
    address: v.address ?? null,
  };
}

const metaOf = (key: number | string) => getChestMeta(key).catch(() => null);

/** /explore: curados (demo, attack…) + cofres públicos (listed:true) de factory y legacy. */
export async function listExploreRows(): Promise<ChestRowData[]> {
  const publicMetas = (await listPublicMetas().catch(() => [])).filter((m) => m.listed === true);
  const publicAddrs = new Set(publicMetas.flatMap((m) => (m.address ? [m.address] : [])));
  const publicIds = new Set(publicMetas.flatMap((m) => (m.id !== undefined ? [m.id] : [])));

  const [factory, legacy] = await Promise.all([readAllFactory(), readAllChests()]);
  const rows: ChestRowData[] = [];
  for (const c of factory) {
    if (!(LISTED_FACTORY_ADDRESSES.includes(c.address) || publicAddrs.has(c.address))) continue;
    rows.push(toRowFromView(factoryView(c, await metaOf(c.address)), c.index));
  }
  for (const c of legacy) {
    const listed = LISTED_CHEST_IDS.includes(c.id) || publicIds.has(c.id);
    if (!listed || HIDDEN_CHEST_IDS.includes(c.id)) continue;
    rows.push(toRowFromView(legacyView(c, await metaOf(c.id))));
  }
  // demo primero, luego lo más nuevo (factory por posición, legacy al final)
  rows.sort((a, b) => {
    const da = a.address === DEMO_CHEST.address && a.address ? 1 : 0;
    const db = b.address === DEMO_CHEST.address && b.address ? 1 : 0;
    if (da !== db) return db - da;
    if (a.kind !== b.kind) return a.kind === "factory" ? -1 : 1;
    return b.id - a.id;
  });
  return rows;
}

export type DashboardData = {
  rows: ChestRowData[];
  /** stroops aún sin reclamar en los cofres abiertos del creador (solo XLM) */
  inEscrowStroops: string;
  /** stroops pagados por esos cofres en la ventana del RPC (solo XLM) */
  paidStroops: string;
};

export async function dashboardFor(address: string, fresh = false): Promise<DashboardData> {
  const [factory, legacy] = await Promise.all([readAllFactory(fresh), readAllChests(fresh)]);
  const views: ChestView[] = [];
  const idx: number[] = [];
  for (const c of factory.filter((c) => c.creator === address)) {
    views.push(factoryView(c, await metaOf(c.address)));
    idx.push(c.index);
  }
  for (const c of legacy.filter((c) => c.creator === address)) {
    views.push(legacyView(c, await metaOf(c.id)));
    idx.push(0);
  }
  let escrow = BigInt(0);
  for (const v of views) if (v.token === CONTRACTS.token && !v.closed) escrow += BigInt(v.poolStroops);

  const ids = new Set(views.flatMap((v) => (v.id !== undefined ? [v.id] : [])));
  const addrs = new Set(views.flatMap((v) => (v.address ? [v.address] : [])));
  let paid = BigInt(0);
  const claimed = await readClaimedCached();
  for (const e of claimed) {
    if (e.address ? addrs.has(e.address) : ids.has(e.chestId)) paid += e.prize;
  }
  return {
    rows: views.map((v, i) => toRowFromView(v, idx[i])).sort((a, b) => (a.kind === b.kind ? b.id - a.id : a.kind === "factory" ? -1 : 1)),
    inEscrowStroops: escrow.toString(),
    paidStroops: paid.toString(),
  };
}

export { chestView };
