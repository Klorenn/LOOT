import { del, list, put } from "@vercel/blob";
import { Horizon } from "@stellar/stellar-sdk";
import type { NetConfig } from "./network";

/**
 * Límites del patrocinio en mainnet (el relayer paga las fees con fondos reales):
 *  - máximo de registros de wallet passkey en total (contador en Blob: un marcador por registro);
 *  - se deja de patrocinar si el saldo del relayer baja de RELAYER_MIN_XLM (3 por defecto).
 * En testnet no hay límites.
 */
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const MAX_REGISTRATIONS = num(process.env.RELAY_MAX_REGISTRATIONS, 60);
export const MIN_BALANCE_STROOPS = BigInt(Math.round(num(process.env.RELAYER_MIN_XLM, 3) * 1e7));

export type SponsorDecision = { ok: true } | { ok: false; reason: "relayer_low" | "registrations_full"; message: string };

export const NOTICES = {
  relayer_low: "Free account setup and fee sponsorship are paused: the relayer is low on funds. You can still use a Stellar wallet (Freighter, xBull, ...).",
  registrations_full: "The limit of sponsored passkey accounts has been reached. You can still connect a Stellar wallet (Freighter, xBull, ...).",
} as const;

/** Decisión pura: ¿se puede patrocinar esta operación? `deploy` = registro de wallet nueva. */
export function decideSponsor(i: {
  mainnet: boolean;
  balance: bigint | null;
  registrations: number;
  deploy: boolean;
  max?: number;
  minBalance?: bigint;
}): SponsorDecision {
  if (!i.mainnet) return { ok: true };
  const min = i.minBalance ?? MIN_BALANCE_STROOPS;
  // sin lectura de saldo no se patrocina: fallar cerrado protege los fondos
  if (i.balance === null || i.balance < min) return { ok: false, reason: "relayer_low", message: NOTICES.relayer_low };
  if (i.deploy && i.registrations >= (i.max ?? MAX_REGISTRATIONS))
    return { ok: false, reason: "registrations_full", message: NOTICES.registrations_full };
  return { ok: true };
}

// ---------- Blob (token explícito: gana sobre OIDC, ver lib/chest-store.ts) ----------
const token = () => process.env.LOOT_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const auth = () => (token() ? { token: token()! } : {});
/** Contador por red (solo mainnet tiene tope; el prefijo deja el espacio listo y separado). */
const prefixFor = (c: NetConfig) => `relay/${c.net}/registrations/`;

async function countRegistrations(c: NetConfig): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: prefixFor(c), limit: 1000, cursor, ...auth() });
    n += page.blobs.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return n;
}

/**
 * Reserva un cupo de registro: escribe el marcador y cuenta; si se pasó del máximo lo borra.
 * Devuelve una función para liberar el cupo si el envío falla. null = sin cupo.
 */
export async function reserveRegistration(c: NetConfig): Promise<{ release: () => Promise<void>; used: number } | null> {
  const id = `${prefixFor(c)}${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const put1 = await put(id, JSON.stringify({ at: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    ...auth(),
  });
  const release = async () => {
    await del(put1.url, auth()).catch(() => undefined);
  };
  const used = await countRegistrations(c);
  if (used > MAX_REGISTRATIONS) {
    await release();
    return null;
  }
  return { release, used };
}

const balanceCache = new Map<string, { at: number; value: bigint | null }>();
const BALANCE_TTL_MS = 10_000;

/** Fees reservadas por txs en vuelo (por red): el saldo efectivo las descuenta aunque el RPC aún no las refleje. */
const inflight = new Map<string, bigint>();
export function reserveFee(c: NetConfig, stroops: bigint): () => void {
  inflight.set(c.net, (inflight.get(c.net) ?? BigInt(0)) + stroops);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inflight.set(c.net, (inflight.get(c.net) ?? BigInt(0)) - stroops);
  };
}
/** Saldo EFECTIVO del relayer en stroops: leído de Horizon (caché 10 s) menos las fees en vuelo. null si no se pudo leer. */
export async function relayerBalance(c: NetConfig, publicKey: string): Promise<bigint | null> {
  const held = inflight.get(c.net) ?? BigInt(0);
  const eff = (v: bigint | null) => (v === null ? null : v - held);
  const hit = balanceCache.get(c.net);
  if (hit && Date.now() - hit.at < BALANCE_TTL_MS) return eff(hit.value);
  let value: bigint | null = null;
  try {
    const acc = await new Horizon.Server(c.NETWORK.horizonUrl).loadAccount(publicKey);
    const native = acc.balances.find((b) => b.asset_type === "native");
    if (native) value = BigInt(Math.round(Number(native.balance) * 1e7));
  } catch {
    value = null;
  }
  balanceCache.set(c.net, { at: Date.now(), value });
  return eff(value);
}

export type SponsorStatus = { sponsoring: boolean; reason?: string; notice?: string; registrationsLeft?: number };

/** Estado público para la UI (aviso cuando el patrocinio está pausado). */
export async function sponsorStatus(c: NetConfig, relayerPublicKey: string | undefined): Promise<SponsorStatus> {
  if (!c.IS_MAINNET) return { sponsoring: true };
  if (!relayerPublicKey) return { sponsoring: false, reason: "relayer_low", notice: NOTICES.relayer_low };
  const [balance, used] = await Promise.all([relayerBalance(c, relayerPublicKey), countRegistrations(c).catch(() => MAX_REGISTRATIONS)]);
  const d = decideSponsor({ mainnet: true, balance, registrations: used, deploy: false });
  if (!d.ok) return { sponsoring: false, reason: d.reason, notice: d.message };
  const left = Math.max(0, MAX_REGISTRATIONS - used);
  return left === 0
    ? { sponsoring: true, registrationsLeft: 0, notice: NOTICES.registrations_full, reason: "registrations_full" }
    : { sponsoring: true, registrationsLeft: left };
}
