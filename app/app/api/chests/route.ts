import { NextResponse } from "next/server";
import { legacyOff } from "@/lib/mainnet-guard";
import { DEMO_CHEST } from "@/lib/config";
import { readChest } from "@/lib/chain";
import { panelState, type PanelChain } from "@/lib/chest-panel-state";
import { listChests } from "@/lib/chest-store";

/** On-chain record of the chest (registry v1 or v2, by ref) or null when ChestNotFound; undefined = could not verify. */
async function chainOf(ref: number): Promise<PanelChain | null | undefined> {
  try {
    const c = await readChest(ref);
    return { closed: c.closed, claims: c.claims, maxClaims: c.maxClaims, deadline: c.deadline, creator: c.creator };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/Error\(Contract,\s*#1\)|ChestNotFound/i.test(message)) return null;
    return undefined;
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
  const chests = await Promise.all(
    all.map(async (c) => {
      const chain = await chainOf(c.id);
      if (chain === undefined) return { ...c, onchain: null, state: null, chain: null };
      return { ...c, onchain: chain !== null, state: panelState(chain, now), chain };
    }),
  );
  return NextResponse.json({ chests });
}
