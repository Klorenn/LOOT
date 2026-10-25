import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_CHEST,
  stroopsToXlm,
  tokenDecimals,
  tokenLabel,
} from "@/lib/config";
import { getChestMeta } from "@/lib/chest-store";
import { readChest, type OnChainChest } from "@/lib/chain";

/** Premio y cupos leídos del contrato (`get_chest`), no de la config. */
async function onChain(id: number) {
  let chest: OnChainChest;
  try {
    chest = await readChest(id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/Error\(Contract,\s*#1\)|ChestNotFound/i.test(message)) return { missing: true as const };
    return { unavailable: true as const };
  }
  const unit = tokenLabel(chest.token);
  const amount = stroopsToXlm(chest.prize, tokenDecimals(chest.token));
  return {
    // Cantidad legible del token; string para no perder precisión.
    prize: amount,
    prizeLabel: `${amount} ${unit}`,
    prizeStroops: chest.prize.toString(),
    token: chest.token,
    maxClaims: chest.maxClaims,
    claims: chest.claims,
    closed: chest.closed,
    deadline: chest.deadline,
    fingerprintHex: chest.fingerprintHex,
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Cofre #1 legacy: misma pregunta en UI, pero la huella era de "42".
  if (n === 1) {
    return NextResponse.json({
      id: 1,
      question: `Legacy chest (demo v0) — use /chest/${DEMO_CHEST.id}`,
      hint: "Respuesta histórica: 42",
      salt: "7",
      fingerprintHex:
        "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
      prizeLabel: null,
      maxClaims: 5,
      template: "bounty",
    });
  }

  const isDemo = n === DEMO_CHEST.id;
  const meta = isDemo ? null : await getChestMeta(n);
  if (!isDemo && !meta) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const chain = await onChain(n);
  if ("missing" in chain) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const live = "unavailable" in chain ? {} : chain;

  if (isDemo) {
    return NextResponse.json({
      id: n,
      question: DEMO_CHEST.question,
      hint: DEMO_CHEST.hint,
      salt: DEMO_CHEST.salt,
      fingerprintHex: DEMO_CHEST.fingerprintHex,
      maxClaims: DEMO_CHEST.slots,
      template: "bounty",
      ...live,
      // sin lectura on-chain no se inventa el premio
      prizeLabel: "prizeLabel" in live ? live.prizeLabel : null,
    });
  }

  return NextResponse.json({
    ...meta,
    ...live,
    prizeLabel: "prizeLabel" in live ? live.prizeLabel : null,
  });
}
