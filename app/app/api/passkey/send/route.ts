import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { NETWORK } from "@/lib/config";

type Body = { xdr: string };

/**
 * Submit a passkey-kit signedTx with fee sponsorship.
 * Prefers OpenZeppelin Channels (RELAYER_API_KEY); falls back to fee-bump
 * with RELAYER_SECRET when Docker/OZ key is unavailable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.xdr) {
      return NextResponse.json({ error: "xdr required" }, { status: 400 });
    }

    const apiKey = process.env.RELAYER_API_KEY;
    const baseUrl =
      process.env.RELAYER_BASE_URL ||
      "https://channels.openzeppelin.com/testnet";

    if (apiKey) {
      const { PasskeyServer } = await import("passkey-kit/server");
      const server = new PasskeyServer({
        networkPassphrase: NETWORK.passphrase,
        rpcUrl: NETWORK.rpcUrl,
        relayer: { baseUrl, apiKey },
      });
      const result = await server.send(body.xdr);
      if (!result.success) {
        return NextResponse.json(
          {
            ok: false,
            error: result.error?.message || "relayer failed",
            code: result.error?.code,
            via: "openzeppelin-channels",
          },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        hash: result.hash,
        via: "openzeppelin-channels",
      });
    }

    const secret = process.env.RELAYER_SECRET || process.env.CREATOR_SECRET;
    if (!secret) {
      return NextResponse.json(
        {
          error:
            "Set RELAYER_API_KEY (OZ Channels) or RELAYER_SECRET for fee-bump",
        },
        { status: 500 },
      );
    }

    const kp = Keypair.fromSecret(secret);
    const parsed = TransactionBuilder.fromXDR(
      body.xdr,
      NETWORK.passphrase,
    ) as Transaction;
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      kp,
      "10000000",
      parsed,
      NETWORK.passphrase,
    );
    feeBump.sign(kp);

    const rpc = new Server(NETWORK.rpcUrl, { allowHttp: true });
    const sent = await rpc.sendTransaction(feeBump);
    if (sent.status === "ERROR") {
      return NextResponse.json(
        {
          ok: false,
          error: JSON.stringify(sent),
          via: "fee-bump",
        },
        { status: 502 },
      );
    }

    // Wait briefly for inclusion
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await rpc.getTransaction(sent.hash);
      if (st.status === Api.GetTransactionStatus.SUCCESS) {
        return NextResponse.json({
          ok: true,
          hash: sent.hash,
          via: "fee-bump",
        });
      }
      if (st.status === Api.GetTransactionStatus.FAILED) {
        return NextResponse.json(
          { ok: false, error: `tx failed ${sent.hash}`, via: "fee-bump" },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      hash: sent.hash,
      via: "fee-bump",
      pending: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("passkey/send", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
