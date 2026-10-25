import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "chestzk-chest";
import { NETWORK } from "@/lib/config";

type Body = {
  chestId: number;
  recipient: string;
  nullifierHex: string;
  proof: { a: string; b: string; c: string };
};

function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "RELAYER_SECRET no configurado" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Body;
    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);

    const client = new Client({
      ...networks.testnet,
      rpcUrl: NETWORK.rpcUrl,
      allowHttp: true,
      publicKey: kp.publicKey(),
      signTransaction,
    });

    const tx = await client.claim(
      {
        chest_id: BigInt(body.chestId),
        recipient: body.recipient,
        nullifier: hexToBuf(body.nullifierHex),
        proof: {
          a: hexToBuf(body.proof.a),
          b: hexToBuf(body.proof.b),
          c: hexToBuf(body.proof.c),
        },
      },
      {
        fee: "10000000",
        timeoutInSeconds: 120,
        // BN254 verify_proof necesita margen de instrucciones
        simulate: true,
      },
    );

    // Forzar leeway alto si el SDK lo expone en la simulación
    if (typeof (tx as { simulate?: (o?: object) => Promise<unknown> }).simulate === "function") {
      await (tx as { simulate: (o?: object) => Promise<unknown> }).simulate({
        instructionLeeway: 100_000_000,
      });
    }

    const sent = await tx.signAndSend();
    const hash =
      sent.sendTransactionResponse?.hash ||
      (sent as { hash?: string }).hash ||
      "";

    return NextResponse.json({
      ok: true,
      hash,
      explorer: hash
        ? `https://stellar.expert/explorer/testnet/tx/${hash}`
        : null,
      result: sent.result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("claim error", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
