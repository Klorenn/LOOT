import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client } from "@findloot/chest";
import { cfg } from "@/lib/cfg";
import { relayMaxFee, relayerSecretFor } from "@/lib/relay-guard";
import { readChest } from "@/lib/chain";
import { isChestAllowed } from "@/lib/chest-allow";
import { resourceFeeOf } from "@/lib/sim-fee";
import { decideSponsor, relayerBalance, reserveFee } from "@/lib/relay-limits";
import { withRpcUrl } from "@/lib/rpc";
import { relayLimit } from "@/lib/rate-limit";
import { relayGate } from "@/lib/relay-gate";
import { inclusionFee } from "@/lib/inclusion-fee";
import { Server } from "@stellar/stellar-sdk/rpc";
import { getChestMeta, reserveSetClaim, type SetClaimReservation } from "@/lib/chest-store";
import { SET_ALREADY_CLAIMED_CODE, SET_ALREADY_CLAIMED_MSG } from "@/lib/chest-set";

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
  // Persistent global limit (Blob-backed; mainnet fails closed if the store is unavailable).
  const gate = await relayGate(req, c, "claim");
  if (!gate.ok) return gate.res;
  let setClaim: SetClaimReservation | null = null;
  let submitted = false;
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

    // Solo cofres que pagan XLM nativo y, en mainnet, cofres habilitados (id) o de un creador aprobado (on-chain):
    // cualquiera puede crear el cofre #1 en el registro público, así que el id solo no alcanza.
    const chestId = Number(body.chestId);
    let chest: Awaited<ReturnType<typeof readChest>>;
    try {
      chest = await readChest(chestId);
    } catch {
      return NextResponse.json({ error: "chest not found" }, { status: 404 });
    }
    if (chest.token !== c.XLM_SAC) {
      return NextResponse.json({ error: "this chest does not pay native XLM" }, { status: 403 });
    }
    if (!isChestAllowed({ restricted: c.IS_MAINNET, ids: c.ALLOWED_CHEST_IDS, creators: c.CREATOR_ALLOWLIST }, chestId, chest.creator)) {
      return NextResponse.json({ error: "this chest is not enabled" }, { status: 403 });
    }

    // Chest sets: ONE Loot per account per set, enforced here only (OFF-CHAIN). This binds callers of this
    // relayer; it does NOT stop someone who uses a second account (sybil) or calls the contract directly.
    // On-chain enforcement is a separate contract change. Reserved atomically BEFORE anything is sent.
    // The metadata read fails open: if the store is unreachable the chest is treated as a normal chest.
    const setRef = (await getChestMeta(chestId).catch(() => null))?.set;
    if (setRef) {
      setClaim = await reserveSetClaim(setRef.id, body.recipient, chestId);
      if (!setClaim.ok)
        return NextResponse.json({ error: SET_ALREADY_CLAIMED_MSG, code: SET_ALREADY_CLAIMED_CODE }, { status: 409 });
    }

    const maxFee = relayMaxFee(c, "claim");
    class FeeCapError extends Error {}

    // Escritura: RPC primario; fallback solo ante error de red (ver lib/rpc.ts).
    // Fee de inclusión dinámica (ver lib/inclusion-fee.ts); se sube más ante TRY_AGAIN (y la fee total sigue acotada por maxFee).
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
          const resource = resourceFeeOf(tx);
          if (resource === null || resource + BigInt(inclusion) > maxFee) {
            throw new FeeCapError(`claim fee ${resource === null ? "unknown" : resource + BigInt(inclusion)} above the cap ${maxFee}`);
          }

          submitted = true; // from here on the outcome can be unknown (timeout, lost response)
          return tx.signAndSend();
        },
        { write: true },
      );

    const release = c.IS_MAINNET ? reserveFee(c, maxFee) : () => {};
    let sent: Awaited<ReturnType<typeof attempt>>;
    // Inclusión dinámica (mainnet: max(p90 de getFeeStats, 200)); 100 stroops puede no incluirse con congestión.
    const baseInclusion = await withRpcUrl((u) => inclusionFee(new Server(u, { allowHttp: true }), c));
    try {
      try {
        sent = await attempt(baseInclusion.toString());
      } catch (e) {
        if (e instanceof FeeCapError || !/TRY_AGAIN/i.test((e as { message?: string })?.message ?? String(e))) throw e;
        sent = await attempt((baseInclusion > BigInt(10000) ? baseInclusion : BigInt(10000)).toString()); // TRY_AGAIN: sube la inclusión (la fee total sigue bajo el tope)
      }
    } catch (e) {
      if (e instanceof FeeCapError) {
        console.warn("claim:", e.message);
        if (setClaim?.ok) await setClaim.release(); // nothing was sent: free the account's set slot
        return NextResponse.json({ error: "claim fee above the relayer cap" }, { status: 503 });
      }
      throw e;
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
    // Set claim marker: free it only when the claim definitely did not happen (nothing was submitted, so a garbage request can't lock someone else's account out, or the
    // contract rejected it). On an ambiguous failure (timeout, lost response) it is kept: the account can
    // retry the SAME chest but not take another one, so a claim that actually landed can't be doubled.
    if (setClaim?.ok && (!submitted || code)) await setClaim.release().catch(() => {});
    return NextResponse.json(
      { error: code ? `Error(Contract, #${code})` : "claim failed" },
      { status: 500 },
    );
  }
}
