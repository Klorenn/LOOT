import { NextResponse } from "next/server";
import { legacyOff } from "@/lib/mainnet-guard";
import { DEMO_CHEST } from "@/lib/config";
import { readAllChests } from "@/lib/listing";
import { panelStateForRef, type PanelChain } from "@/lib/chest-panel-state";
import { isLegacyV2Ref } from "@/lib/registry";
import { listChests } from "@/lib/chest-store";

/**
 * Chain records for the panel come from `readAllChests` (registry scan with a shared 30 s cache), so repeated
 * unauthenticated GETs do not multiply RPC reads. A chest created in the last 30 s may show as not created until the
 * cache refreshes. null = the scan failed: state unknown, not "not created".
 */
async function chainMap(): Promise<Map<number, PanelChain> | null> {
  try {
    const all = await readAllChests();
    return new Map(
      all.map((c) => [c.id, { closed: c.closed, claims: c.claims, maxClaims: c.maxClaims, deadline: c.deadline, creator: c.creator }]),
    );
  } catch {
    return null;
  }
}

export async function GET() {
  const off = await legacyOff();
  if (off) return off;
  // Solo cofres públicos; la sal no sale en el listado.
  const stored = (await listChests()).map(({ salt: _s, ...c }) => (void _s, c));
  const demo = {
    id: DEMO_CHEST.id,
    template: "bounty",
    question: DEMO_CHEST.question,
    hint: DEMO_CHEST.hint,
    prize: DEMO_CHEST.prize,
    maxClaims: DEMO_CHEST.slots,
    createdAt: "2026-10-25T12:00:00Z",
  };
  const ids = new Set(stored.map((c) => c.id));
  const all = ids.has(demo.id) ? stored : [demo, ...stored];
  const now = Math.floor(Date.now() / 1000);
  const map = await chainMap();
  const chests = all.map((c) => {
    if (!map) return { ...c, onchain: null, state: null, chain: null };
    // a legacy ref points at an unrelated burned slot of the new registry: never show its numbers
    const chain = isLegacyV2Ref(c.id) ? null : (map.get(c.id) ?? null);
    return { ...c, onchain: chain !== null, state: panelStateForRef(c.id, chain, now), chain };
  });
  return NextResponse.json({ chests });
}
