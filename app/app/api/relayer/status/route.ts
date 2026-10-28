import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { cfg } from "@/lib/cfg";
import { relayerSecretFor } from "@/lib/relay-guard";
import { NOTICES, sponsorStatus } from "@/lib/relay-limits";
import { checkRelayerBalance } from "@/lib/relayer-alert";

export const dynamic = "force-dynamic";

/** ¿Está patrocinando fees el relayer? (mainnet: pausa por saldo bajo o tope de registros). Sin secretos. */
export async function GET() {
  const c = await cfg();
  const noStore = { "cache-control": "private, no-store" };
  const secret = relayerSecretFor(c);
  const pub = secret ? Keypair.fromSecret(secret).publicKey() : process.env.RELAYER_ACCOUNT_MAINNET;
  try {
    const status = await sponsorStatus(c, pub);
    // Mainnet: strict parity, no extra reads, logs or fields.
    if (c.IS_MAINNET) return NextResponse.json(status, { headers: noStore });
    // Testnet: low-balance alert (structured log + optional webhook) and a `relayerLow` field.
    const b = await checkRelayerBalance(c, pub).catch(() => null);
    return NextResponse.json({ ...status, relayerLow: b ? b.low : true }, { headers: noStore });
  } catch {
    // mainnet falla cerrado: ante un error no se promete patrocinio
    return NextResponse.json(c.IS_MAINNET ? { sponsoring: false, reason: "relayer_low", notice: NOTICES.relayer_low } : { sponsoring: true }, {
      headers: noStore,
    });
  }
}
