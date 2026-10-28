import { chestPath } from "./chest-code";
import { displayId, isV2Ref, refOf } from "./registry";
import { readChest, readClaimedEvents, type ClaimedEvent, type OnChainChest } from "./chain";
import { getChest as demoMeta } from "./chests-demo";
import { getChestMeta, listPublicMetas } from "./chest-store";
import type { SetRef } from "./chest-set";
import { cfg } from "./cfg";
import { isChestAllowed } from "./chest-allow";
import { DEMO_CHEST, stroopsToXlm, tokenDecimals, tokenLabel } from "./config";

/** Solo servidor. Lecturas de cadena con failover (lib/rpc.ts) y caché en memoria de 30 s. */

const TTL = 30_000;
const MAX_SCAN = 300;

// cachés por red: testnet y mainnet no se mezclan
const chestsCache = new Map<string, { at: number; value: OnChainChest[] }>();
const claimedCache = new Map<string, { at: number; value: ClaimedEvent[] }>();

const isMissing = (e: unknown) =>
  /Error\(Contract,\s*#1\)|ChestNotFound/i.test(
    (e as { message?: string })?.message ?? String(e),
  );

/**
 * Cofres de un registry: ids 1.. hasta el primero que no existe (v1) o hasta un bloque entero vacío (v2: los ids de
 * sets comparten contador con los cofres y dejan huecos). `toRef` convierte el id local en ref (lib/registry.ts).
 */
async function scanRegistry(toRef: (id: number) => number, tolerateGaps: boolean): Promise<OnChainChest[]> {
  const out: OnChainChest[] = [];
  const CHUNK = 6;
  for (let start = 1; start <= MAX_SCAN; start += CHUNK) {
    const ids = Array.from({ length: CHUNK }, (_, i) => start + i);
    const res = await Promise.all(
      ids.map((id) =>
        readChest(toRef(id)).catch((e) => {
          if (isMissing(e)) return null;
          throw e; // RPC caído: no se cachea un listado incompleto
        }),
      ),
    );
    if (tolerateGaps) {
      for (const r of res) if (r) out.push(r);
      if (res.every((r) => r === null)) break;
      continue;
    }
    const firstMissing = res.findIndex((r) => r === null);
    for (const r of firstMissing === -1 ? res : res.slice(0, firstMissing)) if (r) out.push(r);
    if (firstMissing !== -1) break;
  }
  return out;
}

/** Todos los cofres de los registries configurados (v1 siempre; v2 solo si hay id v2). */
export async function readAllChests(fresh = false): Promise<OnChainChest[]> {
  const { net, REGISTRY_V2 } = await cfg();
  const hit = chestsCache.get(net);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const v1 = await scanRegistry((id) => id, false);
  const v2 = REGISTRY_V2.chest ? await scanRegistry((id) => refOf(2, id), true) : [];
  const out = [...v1, ...v2];
  chestsCache.set(net, { at: Date.now(), value: out });
  return out;
}

export async function readClaimedCached(): Promise<ClaimedEvent[]> {
  const { net } = await cfg();
  const hit = claimedCache.get(net);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const { items } = await readClaimedEvents();
  claimedCache.set(net, { at: Date.now(), value: items });
  return items;
}

export type ChestStatus = "open" | "claimed" | "expired";

export type ChestRowData = {
  id: number;
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
  token: string;
  creator: string;
  deadline: number;
  /** member of a chest set: /explore shows the whole set as one card (lib/chest-set.ts) */
  set?: SetRef;
};

export function statusOf(c: OnChainChest, nowSec = Math.floor(Date.now() / 1000)): ChestStatus {
  if (c.closed || c.claims >= c.maxClaims) return "claimed";
  if (c.deadline && c.deadline < nowSec) return "expired";
  return "open";
}

export async function toRow(c: OnChainChest): Promise<ChestRowData> {
  const { IS_MAINNET } = await cfg();
  const demo = IS_MAINNET || isV2Ref(c.id) ? undefined : demoMeta(c.id);
  let name = demo?.name;
  let question = !IS_MAINNET && !isV2Ref(c.id) && c.id === DEMO_CHEST.id ? DEMO_CHEST.question : demo?.question;
  let difficulty = demo?.difficulty ?? null;
  let set: SetRef | undefined;
  if (!question) {
    const meta = await getChestMeta(c.id).catch(() => null);
    question = meta?.question;
    difficulty = meta?.difficulty ?? difficulty;
    set = IS_MAINNET ? undefined : meta?.set; // sets are testnet-only (lib/testnet-features.ts)
  }
  const amount = stroopsToXlm(c.prize, tokenDecimals(c.token));
  return {
    id: c.id,
    code: chestPath(c.id).replace("/chest/", ""),
    href: chestPath(c.id),
    name: name ?? `Chest #${String(displayId(c.id)).padStart(4, "0")}`,
    question: question ?? "—",
    difficulty,
    status: statusOf(c),
    claims: c.claims,
    maxClaims: c.maxClaims,
    prizeLabel: `${amount} ${tokenLabel(c.token)}`,
    prizeStroops: c.prize.toString(),
    token: c.token,
    creator: c.creator,
    deadline: c.deadline,
    ...(set ? { set } : {}),
  };
}

/** Cofres listados en /explore: LISTED_CHEST_IDS + cofres públicos (listed:true) del almacén de metadatos. */
export async function listExploreRows(): Promise<ChestRowData[]> {
  const { LISTED_CHEST_IDS, HIDDEN_CHEST_IDS, ALLOWED_CHEST_IDS, CREATOR_ALLOWLIST, IS_MAINNET } = await cfg();
  const all = await readAllChests();
  const publicIds = new Set(
    (await listPublicMetas().catch(() => [])).filter((m) => m.listed === true).map((m) => m.id),
  );
  // mainnet: solo los ids habilitados (MAINNET_SAMPLE_CHEST_ID / MAINNET_LISTED_IDS), nunca los públicos del almacén
  const listed = all.filter((c) =>
    IS_MAINNET
      ? isChestAllowed({ restricted: true, ids: ALLOWED_CHEST_IDS, creators: CREATOR_ALLOWLIST }, c.id, c.creator)
      : (LISTED_CHEST_IDS.includes(c.id) || publicIds.has(c.id)) && !HIDDEN_CHEST_IDS.includes(c.id),
  );
  return Promise.all(listed.map(toRow));
}

export type DashboardData = {
  rows: ChestRowData[];
  /** stroops por cupo restante de los cofres abiertos del creador (solo XLM) */
  inEscrowStroops: string;
  /** stroops pagados por esos cofres en la ventana del RPC (solo XLM) */
  paidStroops: string;
};

export async function dashboardFor(address: string, fresh = false): Promise<DashboardData> {
  const { CONTRACTS } = await cfg();
  const all = await readAllChests(fresh);
  const mine = all.filter((c) => c.creator === address);
  const ids = new Set(mine.map((c) => c.id));
  let escrow = BigInt(0);
  for (const c of mine) {
    if (c.token === CONTRACTS.token && !c.closed) {
      escrow += c.prize * BigInt(Math.max(0, c.maxClaims - c.claims));
    }
  }
  let paid = BigInt(0);
  const claimed = await readClaimedCached();
  const xlmChests = new Set(mine.filter((c) => c.token === CONTRACTS.token).map((c) => c.id));
  for (const e of claimed) if (ids.has(e.chestId) && xlmChests.has(e.chestId)) paid += e.prize;
  return {
    rows: await Promise.all(mine.map(toRow)),
    inEscrowStroops: escrow.toString(),
    paidStroops: paid.toString(),
  };
}
