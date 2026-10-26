import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { cfg } from "@/lib/cfg";
import { relayerSecretFor } from "@/lib/relay-guard";
import { NOTICES, sponsorStatus } from "@/lib/relay-limits";

export const dynamic = "force-dynamic";

/** ¿Está patrocinando fees el relayer? (mainnet: pausa por saldo bajo o tope de registros). Sin secretos. */
export async function GET() {
  const c = await cfg();
  const noStore = { "cache-control": "private, no-store" };
  const secret = relayerSecretFor(c);
  const pub = secret ? Keypair.fromSecret(secret).publicKey() : process.env.RELAYER_ACCOUNT_MAINNET;
  try {
    return NextResponse.json(await sponsorStatus(c, pub), { headers: noStore });
  } catch {
    // mainnet falla cerrado: ante un error no se promete patrocinio
    return NextResponse.json(c.IS_MAINNET ? { sponsoring: false, reason: "relayer_low", notice: NOTICES.relayer_low } : { sponsoring: true }, {
      headers: noStore,
    });
  }
}
