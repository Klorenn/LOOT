import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "@findloot/chest";
import { NETWORK } from "@/lib/config";
import { withRpcUrl } from "@/lib/rpc";
import { Address, xdr } from "@stellar/stellar-sdk";
import { decodeRef } from "@/lib/chest-code";
import { factoryAddressAt } from "@/lib/factory";
import { invokeAsRelayer } from "@/lib/relayer-invoke";
import { routeLimited } from "@/lib/rate-limit";

type Body = {
  /** código de URL del cofre de la factory */
  chest?: string;
  chestId?: number;
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
  typeof v === "string" &&
  new RegExp(`^(0x)?[0-9a-fA-F]{${bytes * 2}}$`).test(v);

function validBody(b: Partial<Body> | null): b is Body {
  return (
    !!b &&
    ((typeof b.chest === "string" && b.chest.length <= 40 && decodeRef(b.chest) !== null) ||
      (b.chest === undefined && Number.isSafeInteger(b.chestId) && (b.chestId as number) >= 0)) &&
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
    if (routeLimited(req, "attack", 10, 60)) {
      return NextResponse.json({ error: "Demo temporarily unavailable.", logs }, { status: 429 });
    }
    const secret = process.env.RELAYER_SECRET;
    if (!secret) {
      console.error("attack: RELAYER_SECRET missing");
      return NextResponse.json(
        { error: "Demo temporarily unavailable.", logs },
        { status: 500 },
      );
    }

    const parsed = (await req.json().catch(() => null)) as Partial<Body> | null;
    if (!validBody(parsed)) {
      return NextResponse.json({ error: "Demo temporarily unavailable.", logs }, { status: 400 });
    }
    const body = parsed;
    push(`bot targets ${body.botRecipient.slice(0, 8)}…`);
    push("copies the victim’s proof + nullifier");
    push("changes recipient → bot account");
    push("sending claim to Loot…");

    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);
    try {
      await withRpcUrl(
        async (rpcUrl) => {
          const ref = typeof body.chest === "string" ? decodeRef(body.chest) : null;
          if (ref?.kind === "factory") {
            const address = await factoryAddressAt(ref.index);
            if (!address) throw new Error("unknown chest");
            const proofScVal = xdr.ScVal.scvMap(
              (["a", "b", "c"] as const).map(
                (k) =>
                  new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol(k),
                    val: xdr.ScVal.scvBytes(hexToBuf(body.proof[k])),
                  }),
              ),
            );
            await invokeAsRelayer(
              address,
              "claim",
              [
                Address.fromString(body.botRecipient).toScVal(),
                xdr.ScVal.scvBytes(hexToBuf(body.nullifierHex)),
                proofScVal,
              ],
              { cpuInstructions: 100_000_000 },
            );
            return;
          }
          const client = new Client({
            ...networks.testnet,
            rpcUrl,
            allowHttp: true,
            publicKey: kp.publicKey(),
            signTransaction,
          });

          const tx = await client.claim(
            {
              chest_id: BigInt(ref?.kind === "legacy" ? ref.id : (body.chestId as number)),
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
        },
        { write: true },
      );
      push("UNEXPECTED: the bot’s claim went through");
      return NextResponse.json({ rejected: false, logs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Soroban simulation surfaces contract errors as `Error(Contract, #N)`; #6 = InvalidProof.
      const rejected = /Error\(Contract,\s*#6\)|InvalidProof/i.test(message);
      if (rejected) {
        push("REJECTED — the proof is not for this account");
        return NextResponse.json({
          rejected: true,
          reason: "the proof is not for this account",
          error: message,
          logs,
        });
      }
      console.error("attack: unexpected simulation error", message);
      const envError = /Error\(Contract,\s*#(\d+)\)/.test(message)
        ? `contract error #${message.match(/Error\(Contract,\s*#(\d+)\)/)![1]}`
        : "unexpected error";
      push(`environment error: ${envError}`);
      return NextResponse.json({ rejected: false, envError, logs });
    }
  } catch (e) {
    console.error("attack error", e);
    return NextResponse.json(
      { error: "Demo temporarily unavailable.", logs },
      { status: 500 },
    );
  }
}
