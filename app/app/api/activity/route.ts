import { NextRequest, NextResponse } from "next/server";
import { cfg } from "@/lib/cfg";
import { readSacTransfers, readWonChests } from "@/lib/chain";

// Escanear eventos del RPC por ventanas puede tardar decenas de segundos: se hace en el servidor
// (sin el tope de conexiones del navegador) y se cachea 20 s por dirección.
export const maxDuration = 60;

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 20_000;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!/^[GC][A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { net } = await cfg();
  const key = `${net}:${address}`; // la misma G tiene actividad distinta en cada red
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.value);
  try {
    const [transfers, wins] = await Promise.all([readSacTransfers(address), readWonChests(address)]);
    const value = {
      transfers: transfers.map((t) => ({ ...t, amount: t.amount.toString() })),
      wins: wins.items.map((w) => ({ ...w, prize: w.prize.toString() })),
    };
    cache.set(key, { at: Date.now(), value });
    return NextResponse.json(value);
  } catch (e) {
    console.error("activity", e);
    return NextResponse.json({ error: "chain read failed" }, { status: 502 });
  }
}
