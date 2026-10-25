import { NextRequest, NextResponse } from "next/server";
import { DEMO_CHEST } from "@/lib/config";
import { decodeRef, type ChestRef } from "@/lib/chest-code";
import { chestView } from "@/lib/views";
import { toRowFromView } from "@/lib/listing";
import { routeLimited } from "@/lib/rate-limit";

/** Acepta el código de la URL (/chest/<code>) o un id numérico legacy. */
function refOf(param: string): ChestRef | null {
  const ref = decodeRef(param);
  if (ref) return ref;
  if (/^\d{1,9}$/.test(param)) return { kind: "legacy", id: Number(param) };
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (routeLimited(req, "chest-view", 120, 1500)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { id } = await ctx.params;
  const ref = refOf(id);
  if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cofre #1 legacy: misma pregunta en UI, pero la huella era de "42".
  if (ref.kind === "legacy" && ref.id === 1) {
    return NextResponse.json({
      id: 1,
      kind: "legacy",
      question: `Legacy chest (demo v0): open the demo chest from /explore`,
      hint: "Legacy answer: 42",
      salt: "7",
      fingerprintHex:
        "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
      prizeLabel: null,
      maxClaims: 5,
      template: "bounty",
    });
  }

  try {
    const view = await chestView(ref);
    if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...view, name: toRowFromView(view).name, template: "bounty", demo: view.address ? view.address === DEMO_CHEST.address : view.id === DEMO_CHEST.id });
  } catch (e) {
    console.error("chest view", e);
    return NextResponse.json({ error: "chain read failed" }, { status: 502 });
  }
}
