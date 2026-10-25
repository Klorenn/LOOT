import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { CONTRACTS, FACTORY, NETWORK } from "./config";
import { encodeChestId, encodeRef } from "./chest-code";
import { allFactoryAddresses, factoryIndexOf } from "./factory";
import { withRpc } from "./rpc";

/**
 * Lecturas de solo-lectura contra Soroban RPC. Sirven en server y en browser
 * (el RPC público de testnet habilita CORS). Nada de esto firma ni envía.
 */

/** Cuenta pública cualquiera: la simulación no la usa para nada más que armar la tx. */
const SIM_SOURCE = "GAKD2FSFFNLBVTUB4JHFYVUUMTKKEEJO2TG77BHV2KCZTDPUB64JU7E2";

/** Último ledger visto en cualquier respuesta (simulate/getEvents); evita getLatestLedger, que hoy tarda 15–60 s. */
let seen: { seq: number; at: number } | null = null;
const noteLedger = (seq: number | undefined) => {
  if (seq) seen = { seq, at: Date.now() };
};

export async function simulateRead(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
) {
  const tx = new TransactionBuilder(new Account(SIM_SOURCE, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await withRpc((s) => s.simulateTransaction(tx));
  noteLedger(sim.latestLedger);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    const err = rpc.Api.isSimulationError(sim)
      ? sim.error
      : "simulation returned no result";
    throw new Error(err);
  }
  return scValToNative(sim.result.retval);
}

export type OnChainChest = {
  id: number;
  creator: string;
  token: string;
  /** stroops por cupo */
  prize: bigint;
  maxClaims: number;
  claims: number;
  deadline: number;
  closed: boolean;
  fingerprintHex: string;
};

/** `get_chest` del contrato principal. Lanza si el cofre no existe. */
export async function readChest(id: number): Promise<OnChainChest> {
  const c = await simulateRead(CONTRACTS.chest, "get_chest", [
    nativeToScVal(id, { type: "u64" }),
  ]);
  return {
    id,
    creator: String(c.creator),
    token: String(c.token),
    prize: BigInt(c.prize),
    maxClaims: Number(c.max_claims),
    claims: Number(c.claims),
    deadline: Number(c.deadline),
    closed: Boolean(c.closed),
    fingerprintHex: Buffer.from(c.fingerprint).toString("hex"),
  };
}

/** Balance (stroops) de `address` en el SAC del premio (XLM). */
export async function readPrizeBalance(address: string): Promise<bigint> {
  const v = await simulateRead(CONTRACTS.token, "balance", [
    Address.fromString(address).toScVal(),
  ]);
  return BigInt(v);
}

export type WonChest = {
  /** id legacy; -1 en cofres de la factory (ver `address`) */
  chestId: number;
  /** cofre de la factory: dirección del contrato */
  address?: string;
  /** segmento de URL /chest/<code> */
  code: string;
  /** lugar (1-based) en cofres de la factory */
  place?: number;
  /** unidades mínimas del token del cofre */
  prize: bigint;
  /** SAC del token pagado (se resuelve con get_chest; "" si no se pudo leer) */
  token: string;
  txHash: string;
  ledger: number;
  closedAt: string;
};

type EventsScan = {
  events: rpc.Api.EventResponse[];
  /** Primer ledger que el RPC todavía conserva (la ventana de retención de getEvents). */
  oldestLedger: number;
  latestLedger: number;
  /** true si se cortó la paginación antes de llegar al final. */
  truncated: boolean;
};

export type WonChestsResult = {
  items: WonChest[];
  oldestLedger: number;
  latestLedger: number;
  truncated: boolean;
};

const WINDOW_LEDGERS = 120_000; // ~7 días a 5 s por ledger (con margen)

/** El RPC escanea como mucho ~10.000 ledgers por request: hay que seguir el cursor hasta el último ledger. */
const ledgerOfCursor = (c: string) =>
  Number(BigInt(c.split("-")[0]) >> BigInt(32));

/**
 * Todos los eventos `<name>` del contrato principal dentro de la ventana de
 * retención del RPC (~7 días). Se arranca en el borde de esa ventana y, si el
 * RPC informa un rango menor, se reintenta con su mínimo.
 */
/**
 * Ledger actual aproximado sin getLatestLedger: se reutiliza el último visto (+5 s por ledger
 * transcurrido) o se lo saca de la respuesta de una simulación barata (que trae latestLedger).
 */
export async function latestLedgerHint(): Promise<number> {
  const fresh = () =>
    seen ? seen.seq + Math.floor((Date.now() - seen.at) / 5000) : null;
  if (seen && Date.now() - seen.at < 60_000) return fresh()!;
  try {
    await simulateRead(CONTRACTS.token, "balance", [
      Address.fromString(SIM_SOURCE).toScVal(),
    ]);
  } catch {
    /* si falla, último recurso abajo */
  }
  const f = fresh();
  if (f) return f;
  return withRpc(async (s) => (await s.getLatestLedger()).sequence);
}

type EventFilter = {
  type: "contract";
  contractIds: string[];
  topics: string[][];
};

/** Hasta 5 filtros × 5 contratos por request del RPC. */
const MAX_FILTERS = 5;
const IDS_PER_FILTER = 5;

async function scanEvents(name: "claimed" | "created"): Promise<EventsScan> {
  const topic = (n: string) => [xdr.ScVal.scvSymbol(n).toXDR("base64"), "*"];
  if (name === "created") {
    return scanWithFilters([
      { type: "contract" as const, contractIds: [CONTRACTS.chest], topics: [topic("created")] },
      { type: "contract" as const, contractIds: [FACTORY.contract], topics: [topic("chest_created")] },
    ]);
  }
  // claimed: contrato legacy + los cofres de la factory más nuevos que quepan (24 en total)
  const chests = (await allFactoryAddresses().catch(() => [] as string[])).slice().reverse();
  const filters: EventFilter[] = [
    { type: "contract", contractIds: [CONTRACTS.chest], topics: [topic("claimed")] },
  ];
  const room = (MAX_FILTERS - 1) * IDS_PER_FILTER + (IDS_PER_FILTER - 1);
  for (let i = 0; i < Math.min(chests.length, room); i += IDS_PER_FILTER) {
    const ids = chests.slice(i, i + IDS_PER_FILTER);
    if (i === 0 && ids.length) {
      // el primer filtro ya tiene el contrato legacy: completa con hasta 4 cofres
      filters[0].contractIds.push(...ids.slice(0, IDS_PER_FILTER - 1));
      const rest = ids.slice(IDS_PER_FILTER - 1);
      if (rest.length) filters.push({ type: "contract", contractIds: rest, topics: [topic("claimed")] });
    } else {
      filters.push({ type: "contract", contractIds: ids, topics: [topic("claimed")] });
    }
    if (filters.length >= MAX_FILTERS) break;
  }
  return scanWithFilters(filters);
}

type ParsedClaim = {
  chestId: number;
  address?: string;
  place?: number;
  recipient: string;
  prize: bigint;
  token: string;
  code: string;
};

/** `claimed` legacy: topic[1]=id u64, valor (receptor, premio). Factory: topic[1]=dirección, valor (receptor, lugar, premio). */
async function parseClaimed(ev: rpc.Api.EventResponse): Promise<ParsedClaim | null> {
  try {
    const key = scValToNative(ev.topic[1]);
    const val = scValToNative(ev.value) as unknown[];
    if (typeof key === "string") {
      const idx = await factoryIndexOf(key);
      if (idx === null) return null;
      return {
        chestId: -1,
        address: key,
        place: Number(val[1]),
        recipient: String(val[0]),
        prize: BigInt(val[2] as bigint),
        token: CONTRACTS.token,
        code: encodeRef({ kind: "factory", index: idx }),
      };
    }
    return {
      chestId: Number(key),
      recipient: String(val[0]),
      prize: BigInt(val[1] as bigint),
      token: "",
      code: encodeChestId(Number(key)),
    };
  } catch {
    return null;
  }
}

/** Ventana máxima que el RPC escanea por request (el resto se pide en ventanas paralelas). */
const SCAN_STEP = 10_000;
const SCAN_PAGES_PER_WINDOW = 20;
const SCAN_TIMEOUT_MS = 25_000;
const SCAN_CONCURRENCY = 6;

async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Eventos que cumplen `filters` en la ventana de retención del RPC (~7 días). Cada request del RPC
 * escanea como mucho ~10.000 ledgers, así que se pide por ventanas [from, to] en paralelo (con
 * tope de concurrencia) y se pagina por cursor dentro de cada una. La última ventana va sin
 * endLedger para no depender de la estimación del ledger actual.
 */
async function scanWithFilters(filters: EventFilter[]): Promise<EventsScan> {
  const latest = await latestLedgerHint();
  let start = Math.max(1, latest - WINDOW_LEDGERS);
  let truncated = false;

  const fetchRaw = async (from: number, to: number) => {
    // Con cursor el RPC no acepta endLedger: se pagina re-pidiendo desde el ledger del último
    // evento (inclusive) y se deduplica por id.
    const seen = new Set<string>();
    const evs: rpc.Api.EventResponse[] = [];
    let cur = from;
    for (let page = 0; page < SCAN_PAGES_PER_WINDOW; page++) {
      const res = await withRpc(
        (s) => s.getEvents({ filters, startLedger: cur, endLedger: to, limit: 200 }),
        { timeoutMs: SCAN_TIMEOUT_MS },
      );
      noteLedger(res.latestLedger);
      let added = 0;
      for (const ev of res.events) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        evs.push(ev);
        added++;
      }
      if (res.events.length < 200 || added === 0) return evs;
      const lastLedger = res.events[res.events.length - 1].ledger;
      if (lastLedger <= cur && page > 0) return evs;
      cur = lastLedger;
      if (page === SCAN_PAGES_PER_WINDOW - 1) truncated = true;
    }
    return evs;
  };

  /** Si el RPC corta por "processing limit" (-32001), la ventana se parte a la mitad y se reintenta. */
  const fetchWindow = async (from: number, to: number): Promise<rpc.Api.EventResponse[]> => {
    try {
      return await fetchRaw(from, to);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      if (/processing limit|-32001/i.test(msg) && to - from > 400) {
        const mid = Math.floor((from + to) / 2);
        const [x, y] = await Promise.all([fetchWindow(from, mid), fetchWindow(mid + 1, to)]);
        return [...x, ...y];
      }
      throw e;
    }
  };

  const windows = (from: number): [number, number][] => {
    const w: [number, number][] = [];
    for (let a = from; a <= latest; a += SCAN_STEP) w.push([a, a + SCAN_STEP - 1]);
    return w;
  };

  // La primera ventana revela, vía su error de rango, el ledger más viejo que conserva el RPC.
  let plan = windows(start);
  let first: rpc.Api.EventResponse[];
  try {
    first = await fetchWindow(plan[0][0], plan[0][1]);
  } catch (e) {
    // el SDK lanza el objeto JSON-RPC ({code, message}), no un Error
    const msg = (e as { message?: string })?.message ?? String(e);
    const m = msg.match(/ledger range:\s*(\d+)\s*-\s*(\d+)/i);
    if (!m || Number(m[1]) <= start) throw e;
    start = Number(m[1]);
    plan = windows(start);
    first = await fetchWindow(plan[0][0], plan[0][1]);
  }
  const rest = await mapPool(plan.slice(1), SCAN_CONCURRENCY, ([f, t]) => fetchWindow(f, t));
  const events = [first, ...rest].flat();
  return { events, oldestLedger: start, latestLedger: latest, truncated };
}

/**
 * Eventos `claimed` cuyo receptor es `address`. El receptor viaja en el valor
 * del evento, no en los topics, así que se filtra en el cliente.
 */
export async function readWonChests(address: string): Promise<WonChestsResult> {
  const scan = await scanEvents("claimed");
  const items: WonChest[] = [];
  for (const ev of scan.events) {
    const c = await parseClaimed(ev);
    if (!c || c.recipient !== address) continue;
    items.push({
      chestId: c.chestId,
      address: c.address,
      code: c.code,
      place: c.place,
      prize: c.prize,
      token: c.token,
      txHash: ev.txHash,
      ledger: ev.ledger,
      closedAt: ev.ledgerClosedAt,
    });
  }
  // el evento legacy no trae el token: se resuelve una vez por cofre
  const tokens = new Map<number, string>();
  await Promise.all(
    [...new Set(items.filter((i) => !i.token).map((i) => i.chestId))].map(async (id) => {
      try {
        tokens.set(id, (await readChest(id)).token);
      } catch {
        /* sin token: la UI muestra solo la cantidad */
      }
    }),
  );
  for (const it of items) if (!it.token) it.token = tokens.get(it.chestId) ?? "";
  items.sort((a, b) => b.ledger - a.ledger);
  return {
    items,
    oldestLedger: scan.oldestLedger,
    latestLedger: scan.latestLedger,
    truncated: scan.truncated,
  };
}

export type ProtocolStats = {
  claims: number;
  /** cofres creados en la ventana */
  created: number;
  /** stroops pagados en el token del premio (XLM) en la ventana */
  paidStroops: string;
  oldestLedger: number;
  latestLedger: number;
  truncated: boolean;
};

/** Contadores reales (contrato legacy + factory) a partir de sus eventos (ventana del RPC). */
export async function readProtocolStats(): Promise<ProtocolStats> {
  // `rejected` no se cuenta: la tx de un claim inválido revierte y sus eventos no se guardan.
  const [claimed, created] = await Promise.all([
    scanEvents("claimed"),
    scanEvents("created"),
  ]);

  // Solo se suma XLM: factory siempre paga XLM; legacy se resuelve por cofre.
  let paid = BigInt(0);
  const perLegacy = new Map<number, bigint>();
  for (const ev of claimed.events) {
    const c = await parseClaimed(ev);
    if (!c) continue;
    if (c.address) paid += c.prize;
    else perLegacy.set(c.chestId, (perLegacy.get(c.chestId) ?? BigInt(0)) + c.prize);
  }
  await Promise.all(
    [...perLegacy].map(async ([id, sum]) => {
      try {
        if ((await readChest(id)).token === CONTRACTS.token) paid += sum;
      } catch {
        /* cofre ilegible: no suma */
      }
    }),
  );

  return {
    claims: claimed.events.length,
    created: created.events.length,
    paidStroops: paid.toString(),
    oldestLedger: claimed.oldestLedger,
    latestLedger: claimed.latestLedger,
    truncated: claimed.truncated || created.truncated,
  };
}

export type ClaimedEvent = {
  /** id legacy; -1 en cofres de la factory */
  chestId: number;
  address?: string;
  place?: number;
  /** unidades mínimas del token del cofre */
  prize: bigint;
  recipient: string;
  txHash: string;
  ledger: number;
  closedAt: string;
};

/** Todos los `claimed` del contrato principal en la ventana del RPC (~7 días). */
export async function readClaimedEvents(): Promise<{
  items: ClaimedEvent[];
  oldestLedger: number;
  truncated: boolean;
}> {
  const scan = await scanEvents("claimed");
  const items: ClaimedEvent[] = [];
  for (const ev of scan.events) {
    const c = await parseClaimed(ev);
    if (!c) continue;
    items.push({
      chestId: c.chestId,
      address: c.address,
      place: c.place,
      prize: c.prize,
      recipient: c.recipient,
      txHash: ev.txHash,
      ledger: ev.ledger,
      closedAt: ev.ledgerClosedAt,
    });
  }
  return { items, oldestLedger: scan.oldestLedger, truncated: scan.truncated };
}

export type SacTransfer = {
  hash: string;
  ledger: number;
  closedAt: string;
  dir: "out" | "in";
  /** la otra parte (G… o C…) */
  counterparty: string;
  amount: bigint;
  /** id de la dirección M… si el pago llegó multiplexado */
  muxId?: string;
};

/** Transferencias del SAC de XLM donde `address` es origen o destino (ventana ~7 días del RPC). */
export async function readSacTransfers(address: string): Promise<SacTransfer[]> {
  const t = xdr.ScVal.scvSymbol("transfer").toXDR("base64");
  const a = Address.fromString(address).toScVal().toXDR("base64");
  const mk = (pos: "from" | "to") => ({
    type: "contract" as const,
    contractIds: [CONTRACTS.token],
    topics:
      pos === "from"
        ? [
            [t, a, "*", "*"],
            [t, a, "*"],
          ]
        : [
            [t, "*", a, "*"],
            [t, "*", a],
          ],
  });
  const [out, inn] = await Promise.all([scanWithFilters([mk("from")]), scanWithFilters([mk("to")])]);
  const parse = (events: rpc.Api.EventResponse[], dir: "out" | "in"): SacTransfer[] =>
    events.flatMap((ev) => {
      try {
        const raw = scValToNative(ev.value) as unknown;
        const amount = typeof raw === "bigint" ? raw : BigInt((raw as { amount: bigint }).amount);
        const muxId =
          typeof raw === "object" && raw && "to_muxed_id" in raw
            ? String((raw as { to_muxed_id: unknown }).to_muxed_id)
            : undefined;
        const from = String(scValToNative(ev.topic[1]));
        const to = String(scValToNative(ev.topic[2]));
        return [
          {
            hash: ev.txHash,
            ledger: ev.ledger,
            closedAt: ev.ledgerClosedAt,
            dir,
            counterparty: dir === "out" ? to : from,
            amount,
            muxId,
          },
        ];
      } catch {
        return [];
      }
    });
  return [...parse(out.events, "out"), ...parse(inn.events, "in")].sort((x, y) => y.ledger - x.ledger);
}
