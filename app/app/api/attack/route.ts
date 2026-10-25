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

const isHex = (v: unknown, bytes: number): v is string =>
  typeof v === "string" && new RegExp(`^(0x)?[0-9a-fA-F]{${bytes * 2}}$`).test(v);

function validBody(b: Partial<Body> | null): b is Body {
  return (
    !!b &&
    Number.isSafeInteger(b.chestId) &&
    (b.chestId as number) >= 0 &&
    typeof b.botRecipient === "string" &&
    /^[GC][A-Z2-7]{55}$/.test(b.botRecipient) &&
    isHex(b.nullifierHex, 32) &&
    !!b.proof &&
    isHex(b.proof.a, 64) &&
    isHex(b.proof.b, 128) &&
    isHex(b.proof.c, 64)
  );
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
      console.error("attack: RELAYER_SECRET missing");
      return NextResponse.json({ error: "server not configured", logs }, { status: 500 });
    }

    const parsed = (await req.json().catch(() => null)) as Partial<Body> | null;
    if (!validBody(parsed)) {
      return NextResponse.json({ error: "bad request", logs }, { status: 400 });
    }
    const body = parsed;
    push(`bot apunta a ${body.botRecipient.slice(0, 8)}…`);
    push("copia proof + nullifier de la víctima");
    push("cambia recipient → cuenta del bot");
    push("enviando claim a Loot…");

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
      console.error("attack: unexpected simulation error", message);
      const envError = /Error\(Contract,\s*#(\d+)\)/.test(message)
        ? `contract error #${message.match(/Error\(Contract,\s*#(\d+)\)/)![1]}`
        : "unexpected error";
      push(`error de entorno: ${envError}`);
      return NextResponse.json({ rejected: false, envError, logs });
    }
  } catch (e) {
    console.error("attack error", e);
    return NextResponse.json({ error: "internal error", logs }, { status: 500 });
  }
}
