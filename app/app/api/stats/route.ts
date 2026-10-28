import { NextResponse } from "next/server";
import { cfg } from "@/lib/cfg";
import { readProtocolStats, type ProtocolStats } from "@/lib/chain";

// La red sale de la cookie: nada de caché compartida entre redes. Memo corto POR RED para no pegarle al RPC en cada visita.
export const dynamic = "force-dynamic";

const memo = new Map<string, { at: number; value: ProtocolStats }>();

export async function GET() {
  const { net } = await cfg();
  const hit = memo.get(net);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.value, { headers: { "cache-control": "private, max-age=60" } });
  try {
    const value = await readProtocolStats();
    memo.set(net, { at: Date.now(), value });
    return NextResponse.json(value, { headers: { "cache-control": "private, max-age=60" } });
  } catch (e) {
    console.error("stats", e);
    return NextResponse.json({ error: "chain read failed", code: "chain_read_failed" }, { status: 502 });
  }
}
