import { NextRequest, NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import {
  StorageNotConfiguredError,
  getPending,
  getSetHeader,
  getSetMember,
  getSetMembers,
  deleteSetMember,
  reserveChestMeta,
  saveChestMeta,
  saveSetHeader,
  saveSetMember,
  type PendingMeta,
} from "@/lib/chest-store";
import { readChest } from "@/lib/chain";
import { cfg } from "@/lib/cfg";
import { canConfirm, canReserve, parseCreatorAllowlist, type MetaGate } from "@/lib/meta-gate";
import { QUIZ_LIMITS, parseQuiz, quizServerGuessable, type Quiz } from "@/lib/quiz";
import { SET_LIMITS, setCapError, type SetRef } from "@/lib/chest-set";
import { isV2Ref, resolveSetId } from "@/lib/registry";

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

/**
 * Set membership declared at reserve time. For question 1 (index 0) the set id is unknown until the chest
 * exists (it IS that chest's id), so it is stored as 0 and replaced at confirm.
 */
function parseSetRef(v: unknown): SetRef | string {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return "bad set";
  const { index, size, id } = o;
  if (!Number.isSafeInteger(size) || (size as number) < SET_LIMITS.min || (size as number) > SET_LIMITS.max) return "bad set size";
  if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= (size as number)) return "bad set index";
  if (!str(o.title, SET_LIMITS.title)) return "bad set title";
  const title = (o.title as string).trim();
  // question 1: registry v1 has no set id yet (it IS the chest id, replaced at confirm); registry v2 sends the on-chain set id
  if (index === 0) return { id: isV2Ref(Number(id)) ? (id as number) : 0, index: 0, size: size as number, title };
  if (!Number.isSafeInteger(id) || (id as number) < 1) return "bad set id";
  return { id: id as number, index: index as number, size: size as number, title };
}

function parseReserve(b: Record<string, unknown>, mainnet: boolean): PendingMeta | string {
  const fp = typeof b.fingerprintHex === "string" ? b.fingerprintHex.toLowerCase() : "";
  if (!HEX64.test(fp)) return "bad fingerprint";
  if (typeof b.creator !== "string" || !StrKey.isValidEd25519PublicKey(b.creator)
    && !StrKey.isValidContract(b.creator)) return "bad creator";
  if (!str(b.question, QUIZ_LIMITS.title)) return "bad question";
  if (b.hint !== undefined && b.hint !== "" && !str(b.hint, 200)) return "bad hint";
  if (b.template !== undefined && !str(b.template, 40)) return "bad template";
  const difficulty = b.difficulty === undefined ? undefined : Number(b.difficulty);
  if (difficulty !== undefined && ![1, 2, 3, 4].includes(difficulty)) return "bad difficulty";
  if (typeof b.prize !== "number" || !Number.isFinite(b.prize) || b.prize <= 0) return "bad prize";
  if (!Number.isSafeInteger(b.maxClaims) || (b.maxClaims as number) < 1 || (b.maxClaims as number) > 100000)
    return "bad maxClaims";
  let quiz: Quiz | undefined;
  if (b.quiz !== undefined && b.quiz !== null) {
    const q = parseQuiz(b.quiz);
    if (typeof q === "string") return q;
    // Solo puede juzgar las opciones: las respuestas escritas nunca llegan al servidor.
    if (quizServerGuessable(q))
      return "quiz too easy to guess: add a typed question or more questions and options";
    quiz = q;
  }
  let set: SetRef | undefined;
  if (b.set !== undefined && b.set !== null) {
    if (mainnet) return "chest sets are not available on mainnet";
    const r = parseSetRef(b.set);
    if (typeof r === "string") return r;
    set = r;
  }
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
    ...(quiz ? { quiz } : {}),
    ...(set ? { set } : {}),
    salt,
    listed,
    fingerprintHex: fp,
    prize: b.prize,
    maxClaims: b.maxClaims as number,
    creator: b.creator,
    reservedAt: new Date().toISOString(),
  };
}

/**
 * Confirms a chest as question `index` of a set. Everything is checked against the chain and write-once
 * records, so nobody can attach a chest to someone else's set:
 *  - the chest must have exactly one slot (a set member = one prize);
 *  - question 1 creates the set header (set id = its chest id); later questions need that header, written
 *    by the same creator, with the same planned size;
 *  - on mainnet the SUM of all members' on-chain prizes (including this one) must stay under the total cap
 *    (the relayer only sees one create_chest at a time, so the across-the-set total is enforced here);
 *  - the (set, question) slot can hold one chest only.
 */
/** Cap across the set: other members' prizes come from the chain, not from anything the client says. */
async function setTotalError(
  setId: number,
  ref: SetRef,
  chest: Awaited<ReturnType<typeof readChest>>,
  caps: { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number },
): Promise<{ error: string; status: number } | null> {
  const others = [...(await getSetMembers(setId, ref.size))].filter(([i]) => i !== ref.index).map(([, cid]) => cid);
  const prizes = [chest.prize];
  for (const cid of others) {
    try {
      prizes.push((await readChest(cid)).prize);
    } catch {
      return { error: "couldn’t read the other chests of this set yet", status: 409 };
    }
  }
  const capBad = setCapError(prizes, caps);
  return capBad ? { error: capBad, status: 403 } : null;
}

async function confirmSetMember(
  pending: PendingMeta,
  chest: Awaited<ReturnType<typeof readChest>>,
  id: number,
  caps: { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number },
): Promise<{ ref: SetRef } | { error: string; status: number }> {
  const ref = pending.set!;
  if (chest.maxClaims !== 1) return { error: "a set question must be a chest with exactly 1 claim", status: 403 };

  const resolved = resolveSetId({ chestRef: id, groupId: chest.groupId, declaredSetId: ref.id, index: ref.index });
  if ("error" in resolved) return { error: resolved.error, status: 403 };
  const setId = resolved.setId;
  // Total cap first, so a rejected question 1 doesn't burn the set id.
  const capBad = await setTotalError(setId, ref, chest, caps);
  if (capBad) return capBad;

  if (ref.index === 0) {
    const w = await saveSetHeader({
      id: setId,
      title: ref.title,
      creator: pending.creator,
      size: ref.size,
      listed: pending.listed !== false,
      createdAt: new Date().toISOString(),
    });
    if (w === "exists") {
      const h = await getSetHeader(setId);
      if (!h || h.creator !== pending.creator) return { error: "set already exists", status: 409 };
    }
  } else {
    const h = await getSetHeader(setId);
    if (!h) return { error: "set not found: question 1 must be saved first", status: 409 };
    if (h.creator !== pending.creator || h.size !== ref.size)
      return { error: "this chest does not belong to that set", status: 403 };
  }

  const w = await saveSetMember(setId, ref.index, id);
  if (w === "exists" && (await getSetMember(setId, ref.index)) !== id)
    return { error: "this question already has a chest", status: 409 };
  if (w === "ok") {
    // Concurrent confirms can each pass the check above before either is stored; re-check with this one in.
    const again = await setTotalError(setId, ref, chest, caps);
    if (again) {
      await deleteSetMember(setId, ref.index);
      return again;
    }
  }
  return { ref: { id: setId, index: ref.index, size: ref.size, title: ref.title } };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });

  const c = await cfg();
  const gate: MetaGate = {
    mainnet: c.IS_MAINNET,
    creatorAllowlist: parseCreatorAllowlist(process.env.MAINNET_CREATOR_ALLOWLIST),
    allowedChestIds: c.ALLOWED_CHEST_IDS,
  };

  try {
    if (b.action === "reserve") {
      const p = parseReserve(b, c.IS_MAINNET);
      if (typeof p === "string") return NextResponse.json({ error: p }, { status: 400 });
      if (!canReserve(gate, p.creator))
        return NextResponse.json({ error: "chest creation on mainnet is limited to approved creators" }, { status: 403 });
      const r = await reserveChestMeta(p);
      if (r === "exists") {
        // reintento legítimo del mismo creador: idempotente; otro creador: conflicto
        const cur = await getPending(p.fingerprintHex);
        if (!cur || cur.creator !== p.creator)
          return NextResponse.json({ error: "fingerprint already reserved" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "confirm") {
      const id = Number(b.chestId);
      const fp = typeof b.fingerprintHex === "string" ? b.fingerprintHex.toLowerCase() : "";
      if (!Number.isSafeInteger(id) || id < 1 || !HEX64.test(fp))
        return NextResponse.json({ error: "bad request" }, { status: 400 });
      const txHash = typeof b.txHash === "string" && TX.test(b.txHash) ? b.txHash.toLowerCase() : undefined;

      const pending = await getPending(fp);
      if (!pending) return NextResponse.json({ error: "no reservation for this fingerprint" }, { status: 404 });

      let chest;
      try {
        chest = await readChest(id);
      } catch {
        return NextResponse.json({ error: "chest not found on-chain yet" }, { status: 409 });
      }
      if (chest.fingerprintHex !== fp || chest.creator !== pending.creator)
        return NextResponse.json({ error: "chest does not match the reservation" }, { status: 403 });
      if (!canConfirm(gate, pending.creator, id))
        return NextResponse.json({ error: "this chest is not enabled on mainnet" }, { status: 403 });

      let setRef: SetRef | undefined;
      if (pending.set) {
        const r = await confirmSetMember(pending, chest, id, c.CAPS);
        if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
        setRef = r.ref;
      }

      const { reservedAt: _r, ...rest } = pending;
      void _r;
      const saved = await saveChestMeta({
        ...rest,
        ...(setRef ? { set: setRef } : {}),
        id,
        txHash,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, id: saved.id });
    }

    return NextResponse.json({ error: "bad action" }, { status: 400 });
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      console.error("chests/meta", e.message);
      return NextResponse.json({ error: "Chest metadata storage is unavailable.", code: "storage_unavailable" }, { status: 503 });
    }
    console.error("chests/meta", e);
    return NextResponse.json({ error: "could not save chest metadata" }, { status: 500 });
  }
}
