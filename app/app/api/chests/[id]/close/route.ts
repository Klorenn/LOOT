import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client } from "@findloot/chest";
import { cfg } from "@/lib/cfg";
import { legacyOff } from "@/lib/mainnet-guard";
import { withRpcUrl } from "@/lib/rpc";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Cierra el cofre y retira el remanente (creator auth).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const off = await legacyOff();
  if (off) return off;
  const { NETWORK, CONTRACTS } = await cfg();
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const secret = process.env.CREATOR_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "CREATOR_SECRET missing" },
        { status: 500 },
      );
    }
    const { id } = await ctx.params;
    const chestId = Number(id);
    if (!Number.isFinite(chestId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }

    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);
    const sent = await withRpcUrl(
      async (rpcUrl) => {
        const client = new Client({
          networkPassphrase: NETWORK.passphrase,
          contractId: CONTRACTS.chest,
          rpcUrl,
          allowHttp: true,
          publicKey: kp.publicKey(),
          signTransaction,
        });

        const tx = await client.close_chest(
          { chest_id: BigInt(chestId) },
          { fee: "10000000", timeoutInSeconds: 120 },
        );
        return tx.signAndSend();
      },
      { write: true },
    );
    const raw = sent.result as
      { unwrap?: () => bigint; value?: bigint } | bigint | null;
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
        ? `${NETWORK.explorerUrl}/tx/${hash}`
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("close_chest", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
