import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks } from "chestzk-chest";
import { CONTRACTS, NETWORK } from "@/lib/config";
import { saveChestMeta } from "@/lib/chest-store";

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

/**
 * Crea un cofre on-chain firmando como CREATOR (tiene CHEST + trustline).
 * La metadata (pregunta) se guarda off-chain en el response; el contrato
 * solo guarda la huella.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CREATOR_SECRET || process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CREATOR_SECRET missing" }, { status: 500 });
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

    const tx = await client.create_chest(
      {
        creator: kp.publicKey(),
        fingerprint: Buffer.from(body.fingerprintHex, "hex"),
        token: CONTRACTS.token,
        prize: BigInt(body.prize),
        max_claims: body.maxClaims,
        deadline: BigInt(body.deadline ?? 0),
      },
      { fee: "10000000", timeoutInSeconds: 120 },
    );

    const sent = await tx.signAndSend();
    const chestId = Number(sent.result);
    const hash =
      sent.sendTransactionResponse?.hash ||
      (sent as { hash?: string }).hash ||
      "";

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

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const link = `${origin}/cofre/${chestId}`;

    return NextResponse.json({
      ok: true,
      chestId,
      hash,
      link,
      explorer: hash
        ? `https://stellar.expert/explorer/testnet/tx/${hash}`
        : null,
      meta: body.meta,
      widget: `<script src="${origin}/widget.js" data-chest="${chestId}"></script>`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("create-chest", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
