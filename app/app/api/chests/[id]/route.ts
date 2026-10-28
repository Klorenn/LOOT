import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_CHEST,
  stroopsToXlm,
  tokenDecimals,
  tokenLabel,
} from "@/lib/config";
import { cfg } from "@/lib/cfg";
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
    creator: chest.creator,
    fingerprintHex: chest.fingerprintHex,
    // Circuit `chestId` input (v2: group_id, the set id for set chests; v1: the chest id).
    groupId: chest.groupId,
    registryVersion: chest.version,
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
  const { IS_MAINNET } = await cfg();
  if (n === 1 && !IS_MAINNET) {
    return NextResponse.json({
      id: 1,
      question: `Legacy chest (demo v0) — use /chest/${DEMO_CHEST.id}`,
      hint: "Legacy answer: 42",
      salt: "7",
      fingerprintHex:
        "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
      prizeLabel: null,
      maxClaims: 5,
      template: "bounty",
    });
  }

  const isDemo = !IS_MAINNET && n === DEMO_CHEST.id; // v1 id only: v2 refs are above the offset
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

  // Cofre privado: la sal nunca se guarda ni se sirve; viaja solo en el #s= del link.
  const { salt, ...rest } = meta!;
  const priv = meta!.listed === false;
  return NextResponse.json({
    ...rest,
    ...(priv ? { saltRequired: true } : { salt }),
    ...live,
    prizeLabel: "prizeLabel" in live ? live.prizeLabel : null,
  });
}
