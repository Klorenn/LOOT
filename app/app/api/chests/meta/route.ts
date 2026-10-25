import { NextRequest, NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import {
  StorageNotConfiguredError,
  getPending,
  replacePendingMeta,
  reserveChestMeta,
  saveChestMeta,
  type PendingMeta,
} from "@/lib/chest-store";
import { allFactoryAddresses, factoryIndexOf, readFactoryChest } from "@/lib/factory";

/**
 * Metadatos off-chain de un cofre, en dos pasos (reserve-then-confirm):
 *  1. reserve: ANTES de crear el cofre, el creador declara su dirección y los metadatos,
 *     indexados por la huella (que nadie más conoce todavía). Write-once.
 *  2. confirm: DESPUÉS de crearlo, el servidor lee `get_chest` y exige que huella y creador
 *     coincidan con la reserva. Solo entonces publica los metadatos bajo el id del cofre.
 * Nadie puede pegar metadatos falsos a un cofre ajeno: no conoce la huella antes de que exista
 * on-chain, y la reserva del creador real ya está hecha.
 */

const HEX64 = /^[0-9a-f]{64}$/;
const TX = /^[0-9a-f]{64}$/i;

const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > 30;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

function parseReserve(b: Record<string, unknown>): PendingMeta | string {
  const fp = typeof b.fingerprintHex === "string" ? b.fingerprintHex.toLowerCase() : "";
  if (!HEX64.test(fp)) return "bad fingerprint";
  if (typeof b.creator !== "string" || !StrKey.isValidEd25519PublicKey(b.creator)
    && !StrKey.isValidContract(b.creator)) return "bad creator";
  if (!str(b.question, 280)) return "bad question";
  if (b.hint !== undefined && b.hint !== "" && !str(b.hint, 200)) return "bad hint";
  if (b.template !== undefined && !str(b.template, 40)) return "bad template";
  const difficulty = b.difficulty === undefined ? undefined : Number(b.difficulty);
  if (difficulty !== undefined && ![1, 2, 3, 4].includes(difficulty)) return "bad difficulty";
  if (typeof b.prize !== "number" || !Number.isFinite(b.prize) || b.prize <= 0) return "bad prize";
  if (!Number.isSafeInteger(b.maxClaims) || (b.maxClaims as number) < 1 || (b.maxClaims as number) > 50)
    return "bad maxClaims";
  const listed = b.listed !== false;
  let salt: string | undefined;
  if (listed) {
    if (typeof b.salt !== "string" || !/^\d{1,80}$/.test(b.salt)) return "bad salt";
    salt = b.salt; // público: sin la sal nadie puede armar la prueba
  }
  return {
    template: (b.template as string | undefined) ?? undefined,
    question: (b.question as string).trim(),
    hint: typeof b.hint === "string" && b.hint.trim() ? b.hint.trim() : undefined,
    difficulty: difficulty as 1 | 2 | 3 | 4 | undefined,
    salt,
    listed,
    fingerprintHex: fp,
    prize: b.prize,
    maxClaims: b.maxClaims as number,
    creator: b.creator,
    reservedAt: new Date().toISOString(),
  };
}

/** ¿Ya hay en la factory un cofre con esta huella? (lectura fresca de la lista y de cada cofre reciente) */
async function chestExistsWithFingerprint(fp: string): Promise<boolean> {
  const addrs = await allFactoryAddresses(true);
  const recent = addrs.slice(-40);
  const infos = await Promise.all(recent.map((a) => readFactoryChest(a).catch(() => null)));
  return infos.some((c) => c?.fingerprintHex === fp);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    if (b.action === "reserve") {
      const p = parseReserve(b);
      if (typeof p === "string") return NextResponse.json({ error: p }, { status: 400 });
      const r = await reserveChestMeta(p);
      if (r === "exists") {
        const cur = await getPending(p.fingerprintHex);
        if (!cur || cur.creator !== p.creator)
          return NextResponse.json({ error: "fingerprint already reserved" }, { status: 409 });
        const same = (a: PendingMeta, c: PendingMeta) =>
          JSON.stringify({ ...a, reservedAt: 0 }) === JSON.stringify({ ...c, reservedAt: 0 });
        if (!same(cur, p)) {
          // Reintento con otros datos: solo se sobrescribe si el cofre con esa huella todavía no existe.
          if (await chestExistsWithFingerprint(p.fingerprintHex))
            return NextResponse.json({ error: "fingerprint already reserved" }, { status: 409 });
          await replacePendingMeta(p);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "confirm") {
      const address = typeof b.address === "string" ? b.address : "";
      const fp = typeof b.fingerprintHex === "string" ? b.fingerprintHex.toLowerCase() : "";
      if (!StrKey.isValidContract(address) || !HEX64.test(fp))
        return NextResponse.json({ error: "bad request" }, { status: 400 });
      const txHash = typeof b.txHash === "string" && TX.test(b.txHash) ? b.txHash.toLowerCase() : undefined;

      const pending = await getPending(fp);
      if (!pending) return NextResponse.json({ error: "no reservation for this fingerprint" }, { status: 404 });

      // Debe ser un contrato creado por la factory (no uno falso que devuelva cualquier creador).
      let index: number | null;
      let chest;
      try {
        index = await factoryIndexOf(address);
        chest = index === null ? null : await readFactoryChest(address, index);
      } catch {
        return NextResponse.json({ error: "chest not found on-chain yet" }, { status: 409 });
      }
      if (!chest) return NextResponse.json({ error: "not a factory chest" }, { status: 403 });
      if (
        chest.fingerprintHex !== fp ||
        chest.creator !== pending.creator ||
        chest.question.trim() !== pending.question
      )
        return NextResponse.json({ error: "chest does not match the reservation" }, { status: 403 });

      const { reservedAt: _r, ...rest } = pending;
      void _r;
      const saved = await saveChestMeta({
        ...rest,
        address,
        txHash,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, address: saved.address });
    }

    return NextResponse.json({ error: "bad action" }, { status: 400 });
  } catch (e) {
    if (e instanceof StorageNotConfiguredError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("chests/meta", e);
    return NextResponse.json({ error: "could not save chest metadata" }, { status: 500 });
  }
}
