import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "@findloot/chest";
import { NETWORK } from "@/lib/config";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Cierra el cofre y retira el remanente (creator auth).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const secret = process.env.CREATOR_SECRET || process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CREATOR_SECRET missing" }, { status: 500 });
    }
    const { id } = await ctx.params;
    const chestId = Number(id);
    if (!Number.isFinite(chestId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);
    const client = new Client({
      ...networks.testnet,
      rpcUrl: NETWORK.rpcUrl,
      allowHttp: true,
      publicKey: kp.publicKey(),
      signTransaction,
    });

    const tx = await client.close_chest(
      { chest_id: BigInt(chestId) },
      { fee: "10000000", timeoutInSeconds: 120 },
    );
    const sent = await tx.signAndSend();
    const raw = sent.result as
      | { unwrap?: () => bigint; value?: bigint }
      | bigint
      | null;
    let refunded = BigInt(0);
    if (raw && typeof raw === "object" && typeof raw.unwrap === "function") {
      refunded = BigInt(raw.unwrap());
    } else if (raw && typeof raw === "object" && raw.value != null) {
      refunded = BigInt(raw.value);
    } else if (typeof raw === "bigint") {
      refunded = raw;
    }

    const hash =
      sent.sendTransactionResponse?.hash ||
      (sent as { hash?: string }).hash ||
      "";

    return NextResponse.json({
      ok: true,
      chestId,
      refunded: refunded.toString(),
      hash,
      explorer: hash
        ? `https://stellar.expert/explorer/testnet/tx/${hash}`
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("close_chest", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
