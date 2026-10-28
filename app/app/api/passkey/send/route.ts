import { NextRequest, NextResponse } from "next/server";
import {
  FeeBumpTransaction,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { cfg } from "@/lib/cfg";
import type { NetConfig } from "@/lib/network";
import type { RelayVerdict } from "@/lib/relay-policy";

type RelayKind = Extract<RelayVerdict, { ok: true }>["kind"];
import { pickRpcUrl } from "@/lib/rpc";
import { inclusionFee } from "@/lib/inclusion-fee";
import { TxPendingError, waitForConfirmation, waitSeconds } from "@/lib/tx-confirm";
import { relayLimit } from "@/lib/rate-limit";
import { relayGate } from "@/lib/relay-gate";
import { safeUpstreamCode, toSafeError } from "@/lib/safe-error";
import { relayMaxFee, relayerSecretFor, vetRelayTx } from "@/lib/relay-guard";
import { decideSponsor, relayerBalance, reserveFee, reserveRegistration } from "@/lib/relay-limits";

type Body = { xdr: string };

const UINT32_MAX = 0xffffffff;

/** La simulación pasó del tope de fee del relayer (p. ej. el deploy de wallet en mainnet antes de extender el TTL del wasm). */
class RelayCapError extends Error {
  constructor(public minResourceFee: string) {
    super("fee above the relayer cap; transaction not relayed");
  }
}

export const SIGNUP_UNAVAILABLE =
  "Passkey signup is temporarily unavailable on Mainnet — connect a Stellar wallet";

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
  c: NetConfig,
  kind: RelayKind,
  raw: Transaction,
  sim: Api.SimulateTransactionSuccessResponse,
  kp: Keypair,
  inclusion: bigint,
): Transaction {
  const minRf = BigInt(sim.minResourceFee);
  const needsBump = minRf + inclusion > BigInt(UINT32_MAX);
  // Mainnet: sin fee-bump, y la fee de la tx FINAL (recursos + inclusión) no puede pasar del tope.
  if (minRf + inclusion > relayMaxFee(c, kind)) throw new RelayCapError(sim.minResourceFee);
  if (c.IS_MAINNET && needsBump) throw new Error("fee-bump is not allowed on mainnet");

  // First build under uint32 so TransactionBuilder accepts the envelope.
  const buildRf = needsBump
    ? BigInt(UINT32_MAX) - inclusion
    : minRf;
  const sorobanData = sim.transactionData.build();
  sorobanData.resourceFee(xdr.Int64.fromString(buildRf.toString()));

  let inner = TransactionBuilder.cloneFrom(raw, {
    fee: String(inclusion),
    sorobanData,
    networkPassphrase: c.NETWORK.passphrase,
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
    c.NETWORK.passphrase,
  );
  inner.sign(kp);

  const bump = TransactionBuilder.buildFeeBumpTransaction(
    kp,
    String(inclusion),
    inner,
    c.NETWORK.passphrase,
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
  c: NetConfig,
  kind: RelayKind,
  signedXdr: string,
  secret: string,
): Promise<{ hash: string; via: string; pending?: boolean }> {
  const kp = Keypair.fromSecret(secret);
  const parsed = TransactionBuilder.fromXDR(
    signedXdr,
    c.NETWORK.passphrase,
  ) as Transaction;

  const op = parsed.operations[0];
  const canRebuild =
    parsed.operations.length === 1 &&
    op?.type === "invokeHostFunction" &&
    !hasSourceAccountAuth(parsed);

  const rpcUrl = await pickRpcUrl();
  const rpc = new Server(rpcUrl, { allowHttp: true });
  // Mainnet: max(p90 de getFeeStats, 200) con tope; con 100 stroops una tx puede no incluirse nunca.
  const inclusion = await inclusionFee(rpc, c);

  if (canRebuild) {
    const invokeOp = op as Operation.InvokeHostFunction;
    const account = await rpc.getAccount(kp.publicKey());
    const built = new TransactionBuilder(account, {
      fee: String(inclusion),
      networkPassphrase: c.NETWORK.passphrase,
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

    console.info("[passkey/send] minResourceFee", sim.minResourceFee, "inclusionFee", inclusion.toString());
    if (BigInt(sim.minResourceFee) + inclusion > relayMaxFee(c, kind)) {
      console.warn(`[passkey/send] ${kind} on ${c.NETWORK_LC}: minResourceFee ${sim.minResourceFee} above cap ${relayMaxFee(c, kind)}`);
      throw new RelayCapError(sim.minResourceFee);
    }

    const signed = assembleDeployTx(c, kind, built, sim, kp, inclusion);
    const sent = await sendWithRetry(rpc, signed);
    return waitForHash(c, rpc, sent.hash, "local-channel");
  }

  if (c.IS_MAINNET) throw new Error("fee-bump is not allowed on mainnet");
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    kp,
    "1000000",
    parsed,
    c.NETWORK.passphrase,
  );
  feeBump.sign(kp);
  const sent = await sendWithRetry(rpc, feeBump);
  return waitForHash(c, rpc, sent.hash, "fee-bump");
}

/** sendTransaction con reintentos ante TRY_AGAIN_LATER (la misma tx firmada es idempotente). */
async function sendWithRetry(rpc: Server, tx: Transaction | FeeBumpTransaction): Promise<{ hash: string }> {
  for (let i = 0; i < 4; i++) {
    const sent = await rpc.sendTransaction(tx);
    if (sent.status === "ERROR") throw new Error(`send ERROR: ${JSON.stringify(sent)}`);
    if (sent.status !== "TRY_AGAIN_LATER") return { hash: sent.hash };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("network busy: the transaction was not accepted, try again");
}

/** Espera la confirmación; si no llega, lanza TxPendingError (nunca "ok" para una tx sin confirmar). */
async function waitForHash(
  c: NetConfig,
  rpc: Server,
  hash: string,
  via: string,
): Promise<{ hash: string; via: string }> {
  await waitForConfirmation((h) => rpc.getTransaction(h), hash, { attempts: waitSeconds(c.IS_MAINNET) });
  return { hash, via };
}

/**
 * Submit a passkey-kit signedTx with fee sponsorship.
 * Prefers OpenZeppelin Channels (RELAYER_API_KEY); else local channel rebuild.
 */
export async function POST(req: NextRequest) {
  let slot: Awaited<ReturnType<typeof reserveRegistration>> = null;
  let release: () => void = () => {};
  let relayKind: RelayKind | undefined;
  let gateRelease: () => Promise<void> = async () => undefined;
  const c = await cfg(); // red de la petición (cookie): fija passphrase, contratos, secretos y límites
  // Mainnet: apagado salvo MAINNET_PASSKEY_ENABLED=true (el deploy de un smart wallet simulaba a ~49.4 XLM
  // de costo de recursos hasta extender el TTL del wasm). Testnet no cambia.
  if (c.IS_MAINNET && !c.PASSKEY_ENABLED) {
    return NextResponse.json(
      { error: "Passkey accounts are testnet-only for now. Connect a Stellar wallet on Mainnet.", code: "passkey_testnet_only" },
      { status: 403 },
    );
  }
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (typeof body?.xdr !== "string" || !body.xdr) {
      return NextResponse.json({ error: "xdr required" }, { status: 400 });
    }

    const limited = relayLimit(req, "passkey-send", c.net);
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }

    // secreto de LA red de la petición; nunca cae al de la otra
    const secret = relayerSecretFor(c);
    const relayerKey = secret ? Keypair.fromSecret(secret).publicKey() : undefined;
    // Solo se retransmite lo que invoca NUESTRO contrato (ver lib/relay-policy.ts).
    const verdict = await vetRelayTx(body.xdr, c, relayerKey);
    if (!verdict.ok) {
      console.warn("passkey/send rejected:", verdict.reason);
      return NextResponse.json({ error: `not relayed: ${verdict.reason}` }, { status: 403 });
    }

    relayKind = verdict.kind;
    // Persistent limits: global per minute, plus wallet deploys per IP and global per day. Taken after vetting
    // so malformed requests do not burn quota; returned if the request fails before anything is sent.
    const gate = await relayGate(req, c, "passkey-send", verdict.kind === "wallet_deploy");
    if (!gate.ok) return gate.res;
    gateRelease = gate.release;
    // Mainnet: saldo mínimo del relayer y tope de registros de wallet (ver lib/relay-limits.ts).
    const deploy = verdict.kind === "wallet_deploy";
    if (c.IS_MAINNET) {
      const watch = relayerKey ?? process.env.RELAYER_ACCOUNT_MAINNET;
      const balance = watch ? await relayerBalance(c, watch) : null;
      const d = decideSponsor({ mainnet: true, balance, registrations: 0, deploy: false });
      if (!d.ok) return NextResponse.json({ error: d.message, code: d.reason }, { status: 503 });
    }
    if (c.IS_MAINNET && deploy) {
      slot = await reserveRegistration(c);
      if (!slot) {
        const d = decideSponsor({ mainnet: true, balance: BigInt(1e12), registrations: 1e9, deploy: true });
        return NextResponse.json({ error: d.ok ? "limit reached" : d.message, code: "registrations_full" }, { status: 503 });
      }
    }

    // OZ Channels por red: mainnet usa *_MAINNET y nunca la clave de testnet
    const apiKey = c.IS_MAINNET ? process.env.RELAYER_API_KEY_MAINNET : process.env.RELAYER_API_KEY;
    const baseUrl = c.IS_MAINNET
      ? (process.env.RELAYER_BASE_URL_MAINNET ?? "")
      : process.env.RELAYER_BASE_URL || "https://channels.openzeppelin.com/testnet";
    if (apiKey && !baseUrl) {
      await slot?.release();
      await gateRelease();
      console.error(`passkey/send: relayer base url missing for ${c.net}`);
      return NextResponse.json({ error: "server not configured", code: "not_configured" }, { status: 500 });
    }

    // fees en vuelo: el saldo efectivo del relayer las descuenta mientras la tx no se confirma (mainnet)
    if (c.IS_MAINNET) release = reserveFee(c, relayMaxFee(c, verdict.kind));

    if (apiKey) {
      const { PasskeyServer } = await import("passkey-kit/server");
      const server = new PasskeyServer({
        networkPassphrase: c.NETWORK.passphrase,
        rpcUrl: await pickRpcUrl(),
        relayer: { baseUrl, apiKey },
      });
      const result = await server.send(body.xdr);
      if (!result.success) {
        await slot?.release();
        await gateRelease();
        console.error("passkey/send: channels failure", result.error?.code, result.error?.message);
        return NextResponse.json(
          {
            ok: false,
            error: "The relayer could not submit the transaction.",
            code: safeUpstreamCode(result.error?.code) ?? "relayer_failed",
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
      await gateRelease();
      console.error(`passkey/send: no relayer configured for ${c.NETWORK_LC}`);
      return NextResponse.json({ error: "server not configured", code: "not_configured" }, { status: 500 });
    }

    const out = await submitAsChannel(c, verdict.kind, body.xdr, secret);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    await slot?.release(); // el cupo de registro se devuelve si el deploy no llegó a enviarse
    if (!(e instanceof TxPendingError)) await gateRelease(); // pending = maybe sent: keep the quota taken
    if (e instanceof RelayCapError) {
      console.warn("passkey/send: over the fee cap, minResourceFee", e.minResourceFee);
      // mensaje claro (no un error de fee crudo) para el alta con passkey en mainnet
      if (relayKind === "wallet_deploy" && c.IS_MAINNET)
        return NextResponse.json({ error: SIGNUP_UNAVAILABLE, code: "passkey_signup_unavailable" }, { status: 503 });
      return NextResponse.json({ error: "Transaction not relayed: fee above the relayer cap", code: "fee_cap" }, { status: 503 });
    }
    if (e instanceof TxPendingError) {
      // enviada pero sin confirmar a tiempo: NO es un éxito. El cliente no debe dar nada por creado.
      console.warn("passkey/send: tx_pending", e.hash);
      return NextResponse.json(
        { ok: false, code: "tx_pending", hash: e.hash, error: "The transaction was not confirmed in time." },
        { status: 504 },
      );
    }
    console.error("passkey/send", e);
    const safe = toSafeError(e, "The relayer could not submit the transaction.");
    return NextResponse.json({ error: safe.error, code: safe.code }, { status: 500 });
  } finally {
    release();
  }
}
