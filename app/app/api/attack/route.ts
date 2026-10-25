import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "chestzk-chest";
import { NETWORK } from "@/lib/config";

type Body = {
  chestId: number;
  /** Cuenta del bot (destino ilegítimo) */
  botRecipient: string;
  nullifierHex: string;
  /** Prueba generada para OTRA cuenta */
  proof: { a: string; b: string; c: string };
};

function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

/**
 * Intenta reclamar con una prueba robada y receptor cambiado.
 * Debe fallar con InvalidProof — eso ES el demo del modo ataque.
 */
export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const push = (m: string) => {
    logs.push(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
  };

  try {
    const secret = process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "RELAYER_SECRET missing", logs }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    push(`bot apunta a ${body.botRecipient.slice(0, 8)}…`);
    push("copia proof + nullifier de la víctima");
    push("cambia recipient → cuenta del bot");
    push("enviando claim a ChestZK…");

    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);
    const client = new Client({
      ...networks.testnet,
      rpcUrl: NETWORK.rpcUrl,
      allowHttp: true,
      publicKey: kp.publicKey(),
      signTransaction,
    });

    try {
      const tx = await client.claim(
        {
          chest_id: BigInt(body.chestId),
          recipient: body.botRecipient,
          nullifier: hexToBuf(body.nullifierHex),
          proof: {
            a: hexToBuf(body.proof.a),
            b: hexToBuf(body.proof.b),
            c: hexToBuf(body.proof.c),
          },
        },
        { fee: "10000000", timeoutInSeconds: 120, simulate: true },
      );
      await tx.signAndSend();
      push("INESPERADO: el claim del bot pasó");
      return NextResponse.json({ rejected: false, logs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Soroban simulation surfaces contract errors as `Error(Contract, #N)`; #6 = InvalidProof.
      const rejected = /Error\(Contract,\s*#6\)|InvalidProof/i.test(message);
      if (rejected) {
        push("RECHAZADO — la prueba no es para esta cuenta");
        return NextResponse.json({
          rejected: true,
          reason: "la prueba no es para esta cuenta",
          error: message,
          logs,
        });
      }
      const envError = message.replace(/\s+/g, " ").slice(0, 160);
      push(`error de entorno: ${envError}`);
      return NextResponse.json({ rejected: false, envError, logs });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    push(message);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}
