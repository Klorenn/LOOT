import { NextResponse } from "next/server";
import { DEMO_CHEST } from "@/lib/config";
import { listChests } from "@/lib/chest-store";

export async function GET() {
  const stored = await listChests();
  const demo = {
    id: DEMO_CHEST.id,
    template: "bounty",
    question: DEMO_CHEST.question,
    hint: DEMO_CHEST.hint,
    prize: DEMO_CHEST.prize,
    maxClaims: 5,
    createdAt: "2026-10-25T12:00:00Z",
  };
  const ids = new Set(stored.map((c) => c.id));
  const all = ids.has(demo.id) ? stored : [demo, ...stored];
  return NextResponse.json({ chests: all });
}
