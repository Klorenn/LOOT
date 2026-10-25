import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "@findloot/chest";
import { CONTRACTS, NETWORK, xlmToStroops } from "@/lib/config";
import { saveChestMeta } from "@/lib/chest-store";
import { requireAdmin } from "@/lib/admin-auth";

type Body = {
  fingerprintHex: string;
  salt: string;
  prize: number;
  maxClaims: number;
  deadline?: number;
  meta: {
    template: string;
    question: string;
    hint?: string;
  };
};

/** Valida TODO el body antes de firmar nada: una tx con parámetros inválidos igual cuesta fee. */
function validBody(b: Partial<Body> | null): b is Body {
  if (!b) return false;
  const m = b.meta;
  return (
    typeof b.fingerprintHex === "string" &&
    /^[0-9a-fA-F]{64}$/.test(b.fingerprintHex) &&
    typeof b.salt === "string" &&
    /^\d{1,80}$/.test(b.salt) &&
    typeof b.prize === "number" &&
    Number.isFinite(b.prize) &&
    b.prize > 0 &&
    Number.isSafeInteger(b.maxClaims) &&
    (b.maxClaims as number) >= 1 &&
    (b.deadline === undefined ||
      (Number.isSafeInteger(b.deadline) && (b.deadline as number) >= 0)) &&
    !!m &&
    typeof m.template === "string" &&
    m.template.length > 0 &&
    typeof m.question === "string" &&
    m.question.trim().length > 0 &&
    (m.hint === undefined || typeof m.hint === "string")
  );
}

/**
 * Crea un cofre on-chain firmando como CREATOR (premio en XLM nativo vía SAC; prize viene en XLM y se convierte a stroops).
 * La metadata (pregunta) se guarda off-chain en el response; el contrato
 * solo guarda la huella.
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const secret = process.env.CREATOR_SECRET || process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CREATOR_SECRET missing" }, { status: 500 });
    }

    const parsed = (await req.json().catch(() => null)) as Partial<Body> | null;
    if (!validBody(parsed)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const body = parsed;
    const kp = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(kp, NETWORK.passphrase);

    const client = new Client({
      ...networks.testnet,
      rpcUrl: NETWORK.rpcUrl,
      allowHttp: true,
      publicKey: kp.publicKey(),
      signTransaction,
    });

    const tx = await client.create_chest(
      {
        creator: kp.publicKey(),
        fingerprint: Buffer.from(body.fingerprintHex, "hex"),
        token: CONTRACTS.token,
        prize: xlmToStroops(body.prize),
        max_claims: body.maxClaims,
        deadline: BigInt(body.deadline ?? 0),
      },
      { fee: "10000000", timeoutInSeconds: 120 },
    );

    const sent = await tx.signAndSend();
    const raw = sent.result as
      | { unwrap?: () => bigint | number; value?: bigint | number }
      | bigint
      | number
      | null;
    let chestId: number;
    if (raw && typeof raw === "object" && typeof raw.unwrap === "function") {
      chestId = Number(raw.unwrap());
    } else if (raw && typeof raw === "object" && "value" in raw) {
      chestId = Number(raw.value);
    } else {
      chestId = Number(raw);
    }
    if (!Number.isFinite(chestId)) {
      throw new Error("create_chest returned no chest id");
    }
    const hash =
      sent.sendTransactionResponse?.hash ||
      (sent as { hash?: string }).hash ||
      "";

    // El cofre ya existe on-chain: si falla guardar la metadata se devuelve el id igual.
    let metaError: string | undefined;
    try {
      await saveChestMeta({
        id: chestId,
        template: body.meta.template,
        question: body.meta.question,
        hint: body.meta.hint,
        salt: body.salt,
        fingerprintHex: body.fingerprintHex,
        prize: body.prize,
        maxClaims: body.maxClaims,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("create-chest: saveChestMeta failed", err);
      metaError = "chest created but metadata was not saved";
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const link = `${origin}/chest/${chestId}`;

    return NextResponse.json({
      ok: true,
      chestId,
      hash,
      link,
      explorer: hash
        ? `https://stellar.expert/explorer/testnet/tx/${hash}`
        : null,
      meta: body.meta,
      ...(metaError ? { metaError } : {}),
      widget: `<script src="${origin}/widget.js" data-chest="${chestId}"></script>`,
    });
  } catch (e) {
    console.error("create-chest", e);
    return NextResponse.json({ error: "create chest failed" }, { status: 500 });
  }
}
