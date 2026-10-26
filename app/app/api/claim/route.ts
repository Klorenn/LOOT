import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client } from "@findloot/chest";
import { cfg } from "@/lib/cfg";
import { relayMaxFee, relayerSecretFor } from "@/lib/relay-guard";
import { readChest } from "@/lib/chain";
import { decideSponsor, relayerBalance, reserveFee } from "@/lib/relay-limits";
import { withRpcUrl } from "@/lib/rpc";
import { relayLimit } from "@/lib/rate-limit";

type Body = {
  chestId: number;
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
    Number.isSafeInteger(b.chestId) &&
    (b.chestId as number) >= 0 &&
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
  const c = await cfg();
  const { NETWORK, CONTRACTS, net } = c;
  if (relayLimit(req, "claim", net)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": "60" } });
  }
  try {
    // secreto de LA red de la petición: nunca se cae al de la otra
    const secret = relayerSecretFor(c);
    if (!secret) {
      console.error(`claim: relayer secret for ${net} missing`);
      return NextResponse.json(
        { error: "server not configured" },
        { status: 500 },
      );
    }

    if (c.IS_MAINNET) {
      const d = decideSponsor({
        mainnet: true,
        balance: await relayerBalance(c, Keypair.fromSecret(secret).publicKey()),
        registrations: 0,
        deploy: false,
      });
      if (!d.ok) return NextResponse.json({ error: d.message, code: d.reason }, { status: 503 });
    }

    const parsed = (await req.json().catch(() => null)) as Partial<Body> | null;
    if (!validBody(parsed)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const body = parsed;
    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);

    // Solo cofres que pagan XLM nativo y, en mainnet, solo los habilitados: el relayer no gasta fees en otros.
    const chestId = Number(body.chestId);
    if (c.ALLOWED_CHEST_IDS && !c.ALLOWED_CHEST_IDS.includes(chestId)) {
      return NextResponse.json({ error: "this chest is not enabled" }, { status: 403 });
    }
    let chestToken: string;
    try {
      chestToken = (await readChest(chestId)).token;
    } catch {
      return NextResponse.json({ error: "chest not found" }, { status: 404 });
    }
    if (chestToken !== c.XLM_SAC) {
      return NextResponse.json({ error: "this chest does not pay native XLM" }, { status: 403 });
    }

    const maxFee = relayMaxFee(c, "claim");
    class FeeCapError extends Error {}

    // Escritura: RPC primario; fallback solo ante error de red (ver lib/rpc.ts).
    // Fee de inclusión ~100 stroops; solo se sube ante TRY_AGAIN (y la fee total sigue acotada por maxFee).
    const attempt = (inclusion: string) =>
      withRpcUrl(
        async (rpcUrl) => {
          const client = new Client({
            networkPassphrase: NETWORK.passphrase,
            contractId: CONTRACTS.chest,
            rpcUrl,
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
              fee: inclusion,
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

          // Tope sobre la tx FINAL (recurso simulado + inclusión) antes de firmar: el leeway de 1e8 no puede inflar la fee.
          const sd = (tx as unknown as { simulationData?: { transactionData: { build(): { resourceFee(): { toString(): string } } } } }).simulationData;
          const resource = sd ? BigInt(sd.transactionData.build().resourceFee().toString()) : null;
          if (resource === null || resource + BigInt(inclusion) > maxFee) {
            throw new FeeCapError(`claim fee ${resource === null ? "unknown" : resource + BigInt(inclusion)} above the cap ${maxFee}`);
          }

          return tx.signAndSend();
        },
        { write: true },
      );

    const release = c.IS_MAINNET ? reserveFee(c, maxFee) : () => {};
    let sent: Awaited<ReturnType<typeof attempt>>;
    try {
      sent = await attempt("100");
    } catch (e) {
      if (e instanceof FeeCapError) {
        console.warn("claim:", e.message);
        return NextResponse.json({ error: "claim fee above the relayer cap" }, { status: 503 });
      }
      if (!/TRY_AGAIN/i.test((e as { message?: string })?.message ?? String(e))) throw e;
      sent = await attempt("10000"); // TRY_AGAIN: sube la inclusión (la fee total sigue bajo el tope)
    } finally {
      release();
    }
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
        ? `${NETWORK.explorerUrl}/tx/${hash}`
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
