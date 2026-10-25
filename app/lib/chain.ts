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
import { CONTRACTS, NETWORK } from "./config";
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

async function simulateRead(
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
  chestId: number;
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
const MAX_PAGES = 80;
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

async function scanEvents(name: "claimed" | "created"): Promise<EventsScan> {
  const latest = await latestLedgerHint();
  let start = Math.max(1, latest - WINDOW_LEDGERS);

  const filters = [
    {
      type: "contract" as const,
      contractIds: [CONTRACTS.chest],
      topics: [[xdr.ScVal.scvSymbol(name).toXDR("base64"), "*"]],
    },
  ];

  const events: rpc.Api.EventResponse[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Awaited<ReturnType<rpc.Server["getEvents"]>>;
    try {
      res = await withRpc((s) =>
        s.getEvents(
          cursor
            ? { filters, cursor, limit: 200 }
            : { filters, startLedger: start, limit: 200 },
        ),
      );
      noteLedger(res.latestLedger);
    } catch (e) {
      // el SDK lanza el objeto JSON-RPC ({code, message}), no un Error
      const msg = (e as { message?: string })?.message ?? String(e);
      const m = msg.match(/ledger range:\s*(\d+)\s*-\s*(\d+)/i);
      if (!cursor && m && Number(m[1]) > start) {
        start = Number(m[1]);
        page--; // reintento con el mínimo que informa el RPC
        continue;
      }
      throw e;
    }
    events.push(...res.events);
    cursor = res.cursor ?? cursor;
    // fin: página parcial y el cursor ya alcanzó el último ledger
    if (
      res.events.length < 200 &&
      (!cursor || ledgerOfCursor(cursor) >= res.latestLedger - 1)
    )
      break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
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
    try {
      const val = scValToNative(ev.value) as [unknown, unknown];
      if (String(val[0]) !== address) continue;
      items.push({
        chestId: Number(scValToNative(ev.topic[1])),
        prize: BigInt(val[1] as bigint),
        token: "",
        txHash: ev.txHash,
        ledger: ev.ledger,
        closedAt: ev.ledgerClosedAt,
      });
    } catch {
      /* evento con forma inesperada: se ignora */
    }
  }
  // el evento no trae el token: se resuelve una vez por cofre
  const tokens = new Map<number, string>();
  await Promise.all(
    [...new Set(items.map((i) => i.chestId))].map(async (id) => {
      try {
        tokens.set(id, (await readChest(id)).token);
      } catch {
        /* sin token: la UI muestra solo la cantidad */
      }
    }),
  );
  for (const it of items) it.token = tokens.get(it.chestId) ?? "";
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

/** Contadores reales del contrato principal a partir de sus eventos (ventana del RPC). */
export async function readProtocolStats(): Promise<ProtocolStats> {
  // `rejected` no se cuenta: la tx de un claim inválido revierte y sus eventos no se guardan.
  const [claimed, created] = await Promise.all([
    scanEvents("claimed"),
    scanEvents("created"),
  ]);

  // El evento no dice el token: se resuelve por cofre y solo se suma XLM.
  const perChest = new Map<number, bigint>();
  for (const ev of claimed.events) {
    try {
      const val = scValToNative(ev.value) as [unknown, unknown];
      const id = Number(scValToNative(ev.topic[1]));
      perChest.set(
        id,
        (perChest.get(id) ?? BigInt(0)) + BigInt(val[1] as bigint),
      );
    } catch {
      /* ignorado */
    }
  }
  let paid = BigInt(0);
  await Promise.all(
    [...perChest].map(async ([id, sum]) => {
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
  chestId: number;
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
    try {
      const val = scValToNative(ev.value) as [unknown, unknown];
      items.push({
        chestId: Number(scValToNative(ev.topic[1])),
        prize: BigInt(val[1] as bigint),
        recipient: String(val[0]),
        txHash: ev.txHash,
        ledger: ev.ledger,
        closedAt: ev.ledgerClosedAt,
      });
    } catch {
      /* evento con forma inesperada: se ignora */
    }
  }
  return { items, oldestLedger: scan.oldestLedger, truncated: scan.truncated };
}
