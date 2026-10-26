import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { sponsorStatus } from "@/lib/relay-limits";

export const dynamic = "force-dynamic";

/** ¿Está patrocinando fees el relayer? (mainnet: pausa por saldo bajo o tope de registros). Sin secretos. */
export async function GET() {
  const secret = process.env.RELAYER_SECRET;
  const pub = secret ? Keypair.fromSecret(secret).publicKey() : process.env.RELAYER_ACCOUNT;
  try {
    return NextResponse.json(await sponsorStatus(pub), { headers: { "cache-control": "public, s-maxage=30" } });
  } catch {
    return NextResponse.json({ sponsoring: true });
  }
}
