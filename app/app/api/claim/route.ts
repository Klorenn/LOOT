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

type Body = {
  /** código de URL del cofre (legacy o factory) */
  chest?: string;
  /** legacy: id numérico (clientes viejos) */
  chestId?: number;
  recipient: string;
  nullifierHex: string;
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
    (typeof b.chest === "string" || (Number.isSafeInteger(b.chestId) && (b.chestId as number) >= 0)) &&
    typeof b.recipient === "string" &&
    /^[GC][A-Z2-7]{55}$/.test(b.recipient) &&
    isHex(b.nullifierHex, 32) &&
    !!b.proof &&
    isHex(b.proof.a, 64) &&
    isHex(b.proof.b, 128) &&
    isHex(b.proof.c, 64)
  );
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RELAYER_SECRET;
    if (!secret) {
      console.error("claim: RELAYER_SECRET missing");
      return NextResponse.json(
        { error: "server not configured" },
        { status: 500 },
      );
    }

    const parsed = (await req.json().catch(() => null)) as Partial<Body> | null;
    if (!validBody(parsed)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const body = parsed;

    // Cofre de la factory: la dirección del contrato sale de la factory (nunca del cliente).
    const ref = typeof body.chest === "string" ? decodeRef(body.chest) : null;
    if (typeof body.chest === "string" && !ref) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    if (ref?.kind === "factory") {
      const address = await factoryAddressAt(ref.index);
      if (!address) return NextResponse.json({ error: "bad request" }, { status: 400 });
      const proofScVal = xdr.ScVal.scvMap(
        (["a", "b", "c"] as const).map(
          (k) =>
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol(k),
              val: xdr.ScVal.scvBytes(hexToBuf(body.proof[k])),
            }),
        ),
      );
      const r = await invokeAsRelayer(
        address,
        "claim",
        [
          Address.fromString(body.recipient).toScVal(),
          xdr.ScVal.scvBytes(hexToBuf(body.nullifierHex)),
          proofScVal,
        ],
        { cpuInstructions: 100_000_000 },
      );
      // (receptor, lugar 1-based, monto) del evento `claimed` de ESTA tx
      const won = r.events.find((e) => e.name === "claimed")?.data as unknown[] | undefined;
      return NextResponse.json({
        ok: true,
        hash: r.hash,
        ledger: r.ledger,
        place: won ? Number(won[1]) : null,
        amountStroops: won ? String(won[2]) : null,
        explorer: `https://stellar.expert/explorer/testnet/tx/${r.hash}`,
      });
    }
    const legacyId = ref?.kind === "legacy" ? ref.id : (body.chestId as number);
    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);

    // Escritura: RPC primario; fallback solo ante error de red (ver lib/rpc.ts).
    const sent = await withRpcUrl(
      async (rpcUrl) => {
        const client = new Client({
          ...networks.testnet,
          rpcUrl,
          allowHttp: true,
          publicKey: kp.publicKey(),
          signTransaction,
        });

        const tx = await client.claim(
          {
            chest_id: BigInt(legacyId),
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
        if (
          typeof (tx as { simulate?: (o?: object) => Promise<unknown> })
            .simulate === "function"
        ) {
          await (tx as { simulate: (o?: object) => Promise<unknown> }).simulate(
            {
              instructionLeeway: 100_000_000,
            },
          );
        }

        return tx.signAndSend();
      },
      { write: true },
    );
    const hash =
      sent.sendTransactionResponse?.hash ||
      (sent as { hash?: string }).hash ||
      "";

    const ledger =
      (sent as { getTransactionResponse?: { ledger?: number } })
        .getTransactionResponse?.ledger ?? null;

    return NextResponse.json({
      ok: true,
      hash,
      ledger,
      explorer: hash
        ? `https://stellar.expert/explorer/testnet/tx/${hash}`
        : null,
      result: sent.result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("claim error", e);
    // El cliente clasifica por código de contrato (#5 usado, #6 prueba inválida…): se devuelve
    // solo ese código, nunca el log de simulación.
    const code = message.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];
    return NextResponse.json(
      { error: code ? `Error(Contract, #${code})` : "claim failed" },
      { status: 500 },
    );
  }
}
