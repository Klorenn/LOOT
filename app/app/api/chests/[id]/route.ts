import { NextRequest, NextResponse } from "next/server";
import { DEMO_CHEST } from "@/lib/config";
import { getChestMeta } from "@/lib/chest-store";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const n = Number(id);

  if (n === DEMO_CHEST.id) {
    return NextResponse.json({
      id: DEMO_CHEST.id,
      question: DEMO_CHEST.question,
      hint: DEMO_CHEST.hint,
      salt: DEMO_CHEST.salt,
      fingerprintHex: DEMO_CHEST.fingerprintHex,
      prize: DEMO_CHEST.prize,
      prizeLabel: DEMO_CHEST.prizeLabel,
      maxClaims: 5,
      template: "bounty",
    });
  }

  // Cofre #1 legacy: misma pregunta en UI, pero la huella era de "42".
  if (n === 1) {
    return NextResponse.json({
      id: 1,
      question: "Cofre legacy (demo v0) — usá /cofre/2",
      hint: "Respuesta histórica: 42",
      salt: "7",
      fingerprintHex:
        "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
      prize: 100,
      prizeLabel: "100 CHEST",
      maxClaims: 5,
      template: "bounty",
    });
  }

  const meta = await getChestMeta(n);
  if (!meta) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...meta,
    prizeLabel: `${meta.prize} CHEST`,
  });
}
