import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { IS_MAINNET, NETWORK } from "@/lib/config";
import { pickRpcUrl } from "@/lib/rpc";
import { relayLimit } from "@/lib/rate-limit";
import { RELAY_MAX_FEE_STROOPS, vetRelayTx } from "@/lib/relay-guard";
import { decideSponsor, relayerBalance, reserveRegistration } from "@/lib/relay-limits";

type Body = { xdr: string };

const UINT32_MAX = 0xffffffff;
const INCLUSION = 100;

/** Auth entry uses the envelope source account (needs fee-bump, not rebuild). */
function hasSourceAccountAuth(tx: Transaction): boolean {
  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue;
    for (const entry of op.auth ?? []) {
      if (
        entry.credentials().switch().name === "sorobanCredentialsSourceAccount"
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Assemble + sign a Soroban deploy. When resourceFee alone exceeds uint32
 * (Protocol 29 rent for smart-wallet create), mirror stellar-cli:
 *   inner.fee = 0, full resourceFee in sorobanData, wrap FeeBump (int64).
 * CAP-46: fee-bump cannot raise resourceFee, but outer fee CAN cover it when
 * inner.fee is 0 (feeBump.fee = resourceFee + inclusion*2).
 */
function assembleDeployTx(
  raw: Transaction,
  sim: Api.SimulateTransactionSuccessResponse,
  kp: Keypair,
): Transaction {
  const minRf = BigInt(sim.minResourceFee);
  const needsBump = minRf + BigInt(INCLUSION) > BigInt(UINT32_MAX);
  // Mainnet: sin fee-bump, y la fee de la tx FINAL no puede pasar del tope.
  if (minRf + BigInt(INCLUSION) > RELAY_MAX_FEE_STROOPS) throw new Error("fee above the relayer cap; transaction not relayed");
  if (IS_MAINNET && needsBump) throw new Error("fee-bump is not allowed on mainnet");

  // First build under uint32 so TransactionBuilder accepts the envelope.
  const buildRf = needsBump
    ? BigInt(UINT32_MAX - INCLUSION)
    : minRf;
  const sorobanData = sim.transactionData.build();
  sorobanData.resourceFee(xdr.Int64.fromString(buildRf.toString()));

  let inner = TransactionBuilder.cloneFrom(raw, {
    fee: String(INCLUSION),
    sorobanData,
    networkPassphrase: NETWORK.passphrase,
  }).build();

  if (!needsBump) {
    inner.sign(kp);
    return inner;
  }

  // stellar-cli assembled.rs: tx.fee = 0; keep full min_resource_fee in data.
  const env = inner.toEnvelope();
  const v1 = env.v1();
  v1.tx().fee(0);
  v1.tx().ext().sorobanData().resourceFee(
    xdr.Int64.fromString(minRf.toString()),
  );
  v1.signatures([]);
  inner = new Transaction(
    xdr.TransactionEnvelope.envelopeTypeTx(v1),
    NETWORK.passphrase,
  );
  inner.sign(kp);

  const bump = TransactionBuilder.buildFeeBumpTransaction(
    kp,
    String(INCLUSION),
    inner,
    NETWORK.passphrase,
  );
  bump.sign(kp);
  return bump as unknown as Transaction;
}

/**
 * Shared-deployer CreateContractV2 txs are sign-only: auth carries the deployer
 * signature; envelope source must be a funded account. OZ Channels does this via
 * `{func,auth}`. Locally we rebuild with RELAYER_SECRET.
 */
async function submitAsChannel(
  signedXdr: string,
  secret: string,
): Promise<{ hash: string; via: string; pending?: boolean }> {
  const kp = Keypair.fromSecret(secret);
  const parsed = TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK.passphrase,
  ) as Transaction;

  const op = parsed.operations[0];
  const canRebuild =
    parsed.operations.length === 1 &&
    op?.type === "invokeHostFunction" &&
    !hasSourceAccountAuth(parsed);

  const rpcUrl = await pickRpcUrl();
  const rpc = new Server(rpcUrl, { allowHttp: true });

  if (canRebuild) {
    const invokeOp = op as Operation.InvokeHostFunction;
    const account = await rpc.getAccount(kp.publicKey());
    const built = new TransactionBuilder(account, {
      fee: String(INCLUSION),
      networkPassphrase: NETWORK.passphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: invokeOp.func,
          auth: invokeOp.auth ?? [],
        }),
      )
      .setTimeout(30)
      .build();

    const sim = await rpc.simulateTransaction(built);
    if (Api.isSimulationError(sim)) {
      throw new Error(`simulate deploy failed: ${sim.error}`);
    }
    if (Api.isSimulationRestore(sim)) {
      throw new Error(
        "deploy simulation requires restore — fund restoreSource / retry",
      );
    }

    console.info("[passkey/send] minResourceFee", sim.minResourceFee);
    if (BigInt(sim.minResourceFee) + BigInt(INCLUSION) > RELAY_MAX_FEE_STROOPS) {
      throw new Error("fee above the relayer cap; transaction not relayed");
    }

    const signed = assembleDeployTx(built, sim, kp);
    const sent = await rpc.sendTransaction(signed);
    if (sent.status === "ERROR") {
      throw new Error(`send ERROR: ${JSON.stringify(sent)}`);
    }
    return waitForHash(rpc, sent.hash, "local-channel");
  }

  if (IS_MAINNET) throw new Error("fee-bump is not allowed on mainnet");
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    kp,
    "1000000",
    parsed,
    NETWORK.passphrase,
  );
  feeBump.sign(kp);
  const sent = await rpc.sendTransaction(feeBump);
  if (sent.status === "ERROR") {
    throw new Error(`fee-bump ERROR: ${JSON.stringify(sent)}`);
  }
  return waitForHash(rpc, sent.hash, "fee-bump");
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
  let slot: Awaited<ReturnType<typeof reserveRegistration>> = null;
  try {
    const body = (await req.json()) as Body;
    if (!body?.xdr) {
      return NextResponse.json({ error: "xdr required" }, { status: 400 });
    }

    const limited = relayLimit(req, "passkey-send");
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }

    const secret = process.env.RELAYER_SECRET;
    const relayerKey = secret ? Keypair.fromSecret(secret).publicKey() : undefined;
    // Solo se retransmite lo que invoca NUESTRO contrato (ver lib/relay-policy.ts).
    const verdict = vetRelayTx(body.xdr, relayerKey);
    if (!verdict.ok) {
      console.warn("passkey/send rejected:", verdict.reason);
      return NextResponse.json({ error: `not relayed: ${verdict.reason}` }, { status: 403 });
    }

    // Mainnet: saldo mínimo del relayer y tope de registros de wallet (ver lib/relay-limits.ts).
    const deploy = verdict.kind === "wallet_deploy";
    if (IS_MAINNET) {
      const watch = relayerKey ?? process.env.RELAYER_ACCOUNT;
      const balance = watch ? await relayerBalance(watch) : null;
      const d = decideSponsor({ mainnet: true, balance, registrations: 0, deploy: false });
      if (!d.ok) return NextResponse.json({ error: d.message, code: d.reason }, { status: 503 });
    }
    if (IS_MAINNET && deploy) {
      slot = await reserveRegistration();
      if (!slot) {
        const d = decideSponsor({ mainnet: true, balance: BigInt(1e12), registrations: 1e9, deploy: true });
        return NextResponse.json({ error: d.ok ? "limit reached" : d.message, code: "registrations_full" }, { status: 503 });
      }
    }

    const apiKey = process.env.RELAYER_API_KEY;
    const baseUrl =
      process.env.RELAYER_BASE_URL ||
      (IS_MAINNET ? "" : "https://channels.openzeppelin.com/testnet");
    if (apiKey && !baseUrl) {
      await slot?.release();
      return NextResponse.json({ error: "Set RELAYER_BASE_URL for mainnet Channels" }, { status: 500 });
    }

    if (apiKey) {
      const { PasskeyServer } = await import("passkey-kit/server");
      const server = new PasskeyServer({
        networkPassphrase: NETWORK.passphrase,
        rpcUrl: await pickRpcUrl(),
        relayer: { baseUrl, apiKey },
      });
      const result = await server.send(body.xdr);
      if (!result.success) {
        await slot?.release();
        return NextResponse.json(
          {
            ok: false,
            error: result.error?.message || "relayer failed",
            code: result.error?.code,
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

    if (!secret) {
      await slot?.release();
      return NextResponse.json(
        {
          error:
            "Set RELAYER_API_KEY (OZ Channels) or RELAYER_SECRET for local channel",
        },
        { status: 500 },
      );
    }

    const out = await submitAsChannel(body.xdr, secret);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("passkey/send", e);
    await slot?.release();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
