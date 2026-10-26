"use client";

import { Keypair, rpc, scValToNative } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client } from "@findloot/chest";
import { latestLedgerHint } from "./chain";
import type { Quiz } from "./quiz";
import { capError } from "./caps";
import { CONTRACTS, NETWORK } from "./client-cfg";
import { clientCfg } from "./network";
import { resourceFeeOf } from "./sim-fee";
import { getPasskeyKit } from "./passkey-client";
import { SendError } from "./send";
import { submitPasskeyTx, type Player } from "./wallet";
import { signWithWallet } from "./wallets-kit";

/**
 * El creador firma `create_chest` con SU cuenta y el premio (prize × max_claims) sale de su saldo
 * vía el SAC del XLM. No interviene ninguna clave del servidor.
 *  - G (demo / wallet externa): la cuenta es fuente y paga la fee; se envía por RPC.
 *  - C (passkey): se simula con una cuenta pública, la passkey firma las auth entries
 *    (creator + transfer anidado del SAC) y /api/passkey/send arma el sobre con el relayer.
 */

export type CreateInput = {
  fingerprintHex: string;
  /** stroops por cupo */
  prizeStroops: bigint;
  maxClaims: number;
  /** segundos unix; 0 = sin vencimiento */
  deadline: number;
};

export type ChestMetaInput = {
  template?: string;
  question: string;
  hint?: string;
  difficulty?: number;
  /** Cofre cuestionario: solo la parte pública (lib/quiz.ts). */
  quiz?: Quiz;
  prize: number;
  /** false = privado: la sal no se guarda en el servidor */
  listed: boolean;
  /** solo se envía si listed */
  salt?: string;
};

const SIM_ACCOUNT = "GAKD2FSFFNLBVTUB4JHFYVUUMTKKEEJO2TG77BHV2KCZTDPUB64JU7E2";

async function postMeta(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/chests/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new SendError(
      d.error === "fingerprint already reserved"
        ? "This answer/salt combination was already reserved. Try again."
        : `Couldn’t save the chest details (${d.error || res.status}).`,
    );
  }
}

/** Paso 1: reserva los metadatos ANTES de gastar nada on-chain. */
export function reserveMeta(player: Player, input: CreateInput, meta: ChestMetaInput) {
  return postMeta({
    action: "reserve",
    creator: player.publicKey,
    fingerprintHex: input.fingerprintHex,
    maxClaims: input.maxClaims,
    ...meta,
    salt: meta.listed ? meta.salt : undefined,
  });
}

/** Paso 3: confirma contra la cadena (el servidor verifica creador y huella). Reintentable. */
export function confirmMeta(chestId: number, fingerprintHex: string, txHash?: string) {
  return postMeta({ action: "confirm", chestId, fingerprintHex, txHash });
}

function newClient(publicKey: string, signTransaction?: unknown): Client {
  return new Client({
    networkPassphrase: NETWORK.passphrase,
    contractId: CONTRACTS.chest,
    rpcUrl: NETWORK.rpcUrl,
    allowHttp: true,
    publicKey,
    ...(signTransaction ? { signTransaction } : {}),
  } as never);
}

const createArgs = (player: Player, i: CreateInput) => ({
  creator: player.publicKey,
  fingerprint: Buffer.from(i.fingerprintHex, "hex"),
  token: CONTRACTS.token,
  prize: i.prizeStroops,
  max_claims: i.maxClaims,
  deadline: BigInt(i.deadline),
});

/** Espera la tx y devuelve su valor de retorno (create_chest: u64; close_chest: i128). */
async function returnValueFromTx(hash: string): Promise<unknown> {
  const server = new rpc.Server(NETWORK.rpcUrl, { allowHttp: true });
  const deadline = Date.now() + 90_000;
  for (;;) {
    const r = await server.getTransaction(hash).catch(() => null);
    if (r && r.status === "SUCCESS") {
      if (!r.returnValue) throw new SendError("The transaction succeeded but its result couldn’t be read.");
      return scValToNative(r.returnValue);
    }
    if (r && r.status === "FAILED") throw new SendError("The network rejected the transaction.");
    if (Date.now() > deadline) throw new SendError("Timed out waiting for the network. Check your wallet activity before retrying.");
    await new Promise((res) => setTimeout(res, 2000));
  }
}

type Phase = (phase: "signing" | "pending") => void;
type Build = (client: Client, opts: object) => Promise<{ sign(): Promise<unknown>; send(): Promise<unknown> }>;

export async function createChestOnChain(
  player: Player,
  input: CreateInput,
  onPhase?: Phase,
): Promise<{ chestId: number; hash: string }> {
  if (!Number.isSafeInteger(input.deadline) || input.deadline <= Math.floor(Date.now() / 1000))
    throw new SendError("The chest needs an expiry in the future; otherwise the prize could never be recovered.");
  if (clientCfg().IS_MAINNET && input.deadline > Math.floor(Date.now() / 1000) + 30 * 86400)
    throw new SendError("On mainnet the expiry can be at most 30 days from now.");
  const capBad = capError(input.prizeStroops, input.maxClaims, clientCfg().CAPS);
  if (capBad) throw new SendError(capBad);
  const hash = await invokeAsCreator(player, (c, o) => c.create_chest(createArgs(player, input), o) as never, onPhase);
  return { chestId: Number(await returnValueFromTx(hash)), hash };
}

/** El creador cierra un cofre vencido: el contrato le devuelve (max_claims − claims) × prize. */
export async function closeChestOnChain(
  player: Player,
  chestId: number,
  onPhase?: Phase,
): Promise<{ hash: string; refunded: bigint }> {
  const hash = await invokeAsCreator(player, (c, o) => c.close_chest({ chest_id: BigInt(chestId) }, o) as never, onPhase);
  return { hash, refunded: BigInt((await returnValueFromTx(hash)) as bigint) };
}

/** Firma con la cuenta de sesión y envía; devuelve el hash. G por RPC, C por passkey + relayer. */
async function invokeAsCreator(player: Player, build: Build, onPhase?: Phase): Promise<string> {
  if (player.kind === "passkey") return invokePasskey(player, build, onPhase);

  let signTransaction: unknown;
  if (player.kind === "classic" && player.secretKey) {
    signTransaction = basicNodeSigner(Keypair.fromSecret(player.secretKey), NETWORK.passphrase).signTransaction;
  } else if (player.kind === "wallet" && player.walletId) {
    const walletId = player.walletId;
    signTransaction = async (xdrStr: string) => {
      const signedTxXdr = await signWithWallet(xdrStr, player.publicKey, walletId, NETWORK.passphrase);
      return { signedTxXdr, signerAddress: player.publicKey };
    };
  } else {
    throw new SendError("This session can’t sign transactions.");
  }

  const client = newClient(player.publicKey, signTransaction);
  const at = await build(client, { fee: "10000000", timeoutInSeconds: 120 });
  onPhase?.("signing");
  await at.sign();
  onPhase?.("pending");
  const sent = await at.send();
  const hash = (sent as unknown as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash;
  if (!hash) throw new SendError("The network didn’t return a transaction hash.");
  return hash;
}

async function invokePasskey(player: Player, build: Build, onPhase?: Phase): Promise<string> {
  const kit = getPasskeyKit();
  if (!kit.keyId || !kit.wallet || kit.wallet.options.contractId !== player.publicKey) {
    try {
      await kit.connectWallet({ keyId: player.keyId });
    } catch (e) {
      console.warn("connectWallet (create):", e); // bug conocido de passkey-kit 0.19 (parche en patches/)
    }
  }
  if (!kit.keyId || !kit.wallet) throw new SendError("Couldn’t unlock your passkey wallet. Try logging in again.");

  const client = newClient(SIM_ACCOUNT);
  const at = await build(client, { simulate: true });
  const expiration = (await latestLedgerHint()) + 120;
  onPhase?.("signing");
  const signed = await kit.sign(at as never, undefined, { expiration });
  const xdrStr = (signed as { built?: { toXDR(): string } }).built?.toXDR();
  if (!xdrStr) throw new SendError("Couldn’t build the signed transaction.");
  onPhase?.("pending");
  const hash = await submitPasskeyTx(xdrStr);
  return hash;
}

/**
 * Fee de red estimada ANTES de firmar: simula create_chest (cuenta pública para C/passkey, la propia
 * para G) y devuelve resourceFee + fee base en stroops. null si la simulación no se puede hacer
 * (p. ej. saldo insuficiente): la UI muestra "—" y no bloquea.
 */
export async function estimateCreateFee(player: Player, input: CreateInput): Promise<bigint | null> {
  try {
    const client = newClient(player.kind === "passkey" ? SIM_ACCOUNT : player.publicKey);
    const at = await client.create_chest(createArgs(player, input), { simulate: true } as never);
    const rf = resourceFeeOf(at);
    return rf === null ? null : rf + BigInt(100);
  } catch {
    return null;
  }
}
