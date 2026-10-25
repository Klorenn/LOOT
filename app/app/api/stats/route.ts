import { NextResponse } from "next/server";
import { readProtocolStats } from "@/lib/chain";

// Cache corto: la landing no debe pegarle al RPC en cada visita.
export const revalidate = 60;

export async function GET() {
  try {
    return NextResponse.json(await readProtocolStats());
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
