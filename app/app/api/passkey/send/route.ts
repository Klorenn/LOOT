import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { NETWORK } from "@/lib/config";
import { pickRpcUrl } from "@/lib/rpc";
import { GuardError, MAX_RESOURCE_FEE, assertAllowedPasskeyTx, assertResourceCap } from "@/lib/passkey-guard";
import { routeLimited } from "@/lib/rate-limit";

type Body = { xdr: string };

const INCLUSION = 100;

/**
 * Arma la tx FINAL que paga el relayer: costo de recursos de la simulación hecha con el relayer
 * como fuente (la que manda para la tx), acotado por MAX_RESOURCE_FEE. Sin fee-bump: una auth de
 * cuenta personalizada (`__check_auth`) puede encarecer esta segunda simulación, por eso el tope
 * se aplica acá y no solo sobre la tx original.
 */
function assembleTx(
  raw: Transaction,
  sim: Api.SimulateTransactionSuccessResponse,
  kp: Keypair,
): Transaction {
  const sorobanData = sim.transactionData.build();
  const resourceFee = BigInt(sorobanData.resourceFee().toString());
  if (BigInt(sim.minResourceFee) > MAX_RESOURCE_FEE || resourceFee > MAX_RESOURCE_FEE) {
    throw new GuardError("resource fee above cap");
  }
  const tx = TransactionBuilder.cloneFrom(raw, {
    fee: String(INCLUSION),
    sorobanData,
    networkPassphrase: NETWORK.passphrase,
  }).build();
  // Última barrera: fee total (inclusión + recursos) sobre la tx que se firma.
  if (BigInt(tx.fee) > MAX_RESOURCE_FEE + BigInt(INCLUSION) * BigInt(2)) {
    throw new GuardError("transaction fee above cap");
  }
  tx.sign(kp);
  return tx;
}

/**
 * Soroban tx de passkey (ya validada por assertAllowedPasskeyTx: una op, auth de dirección): se
 * reconstruye con la cuenta del relayer como fuente y pagadora, copiando solo `{func, auth}`.
 */
async function submitAsChannel(
  signedXdr: string,
  secret: string,
): Promise<{ hash: string; via: string; pending?: boolean }> {
  const kp = Keypair.fromSecret(secret);
  const parsed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase) as Transaction;
  const op = parsed.operations[0];
  if (parsed.operations.length !== 1 || op?.type !== "invokeHostFunction") {
    throw new GuardError("unsupported transaction shape");
  }

  const rpcUrl = await pickRpcUrl();
  const rpc = new Server(rpcUrl, { allowHttp: true });
  const invokeOp = op as Operation.InvokeHostFunction;
  const account = await rpc.getAccount(kp.publicKey());
  const built = new TransactionBuilder(account, {
    fee: String(INCLUSION),
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.invokeHostFunction({ func: invokeOp.func, auth: invokeOp.auth ?? [] }))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(built);
  if (Api.isSimulationError(sim)) throw new GuardError("simulation failed");
  if (Api.isSimulationRestore(sim)) throw new GuardError("needs restore");

  console.info("[passkey/send] minResourceFee", sim.minResourceFee);
  const signed = assembleTx(built, sim, kp);
  const sent = await rpc.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error(`send ERROR: ${JSON.stringify(sent)}`);
  }
  return waitForHash(rpc, sent.hash, "local-channel");
}

async function waitForHash(
  rpc: Server,
  hash: string,
  via: string,
): Promise<{ hash: string; via: string; pending?: boolean }> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await rpc.getTransaction(hash);
    if (st.status === Api.GetTransactionStatus.SUCCESS) {
      return { hash, via };
    }
    if (st.status === Api.GetTransactionStatus.FAILED) {
      throw new Error(`tx failed ${hash}`);
    }
  }
  return { hash, via, pending: true };
}

/**
 * Submit a passkey-kit signedTx with fee sponsorship.
 * Prefers OpenZeppelin Channels (RELAYER_API_KEY); else local channel rebuild.
 */
export async function POST(req: NextRequest) {
  try {
    if (routeLimited(req, "passkey-send", 20, 120)) {
      return NextResponse.json({ error: "too many requests" }, { status: 429 });
    }
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || typeof body.xdr !== "string" || body.xdr.length > 100_000) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    // Lista cerrada: el relayer paga la fee, así que solo retransmite lo que la app genera.
    try {
      const tx = await assertAllowedPasskeyTx(body.xdr);
      await assertResourceCap(tx, await pickRpcUrl());
    } catch (e) {
      if (e instanceof GuardError) {
        console.warn("passkey/send rejected:", e.message);
        return NextResponse.json({ error: "bad request" }, { status: 400 });
      }
      throw e;
    }

    const apiKey = process.env.RELAYER_API_KEY;
    const baseUrl =
      process.env.RELAYER_BASE_URL ||
      "https://channels.openzeppelin.com/testnet";

    if (apiKey) {
      // OZ Channels paga la fee: el tope de recursos solo se verificó con la simulación de arriba
      // (la API de Channels no expone una opción de fee máxima en passkey-kit 0.19). Riesgo residual:
      // una cuenta personalizada podría costar más al re-simularse del lado de Channels.
      const { PasskeyServer } = await import("passkey-kit/server");
      const server = new PasskeyServer({
        networkPassphrase: NETWORK.passphrase,
        rpcUrl: await pickRpcUrl(),
        relayer: { baseUrl, apiKey },
      });
      const result = await server.send(body.xdr);
      if (!result.success) {
        return NextResponse.json(
          {
            ok: false,
            error: "relay failed",
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

    const secret = process.env.RELAYER_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "relay not configured" },
        { status: 500 },
      );
    }

    const out = await submitAsChannel(body.xdr, secret);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof GuardError) {
      console.warn("passkey/send rejected:", e.message);
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    // el detalle queda en el log del servidor, nunca en la respuesta
    console.error("passkey/send", e);
    return NextResponse.json({ error: "relay failed" }, { status: 500 });
  }
}
