"use client";

import { Address, contract, Keypair, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { latestLedgerHint } from "./chain";
import { CONTRACTS, FACTORY, NETWORK } from "./config";
import { createArgs, scheduleError } from "./factory";
import { getPasskeyKit } from "./passkey-client";
import { SendError } from "./send";
import { submitPasskeyTx, type Player } from "./wallet";
import { signWithWallet } from "./wallets-kit";

/**
 * El creador firma SU transacción y paga de su saldo (premios + 5 XLM de creación + reserva de
 * fees). Sin claves del servidor.
 *  - G (demo / wallet externa): la cuenta es fuente y paga la fee de red; se envía por RPC.
 *  - C (passkey): se simula con una cuenta pública, la passkey firma las auth entries
 *    (creator + transfers anidados del SAC) y /api/passkey/send arma el sobre con el relayer.
 * Factory: create_chest(creator, question, fingerprint, prizes, duration_days) → dirección del
 * contrato nuevo. close(chest) la firma el creador (cierra y devuelve premio sin reclamar + reserva).
 */

export type CreateInput = {
  question: string;
  fingerprintHex: string;
  /** premios por lugar en orden de reclamo (stroops) */
  prizes: bigint[];
  days: number;
};

export type ChestMetaInput = {
  template?: string;
  question: string;
  hint?: string;
  difficulty?: number;
  /** premio total en XLM (solo para metadatos de listado) */
  prize: number;
  places: number;
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
export function reserveMeta(player: Player, fingerprintHex: string, meta: ChestMetaInput) {
  return postMeta({
    action: "reserve",
    creator: player.publicKey,
    fingerprintHex,
    maxClaims: meta.places,
    template: meta.template,
    question: meta.question,
    hint: meta.hint,
    difficulty: meta.difficulty,
    prize: meta.prize,
    listed: meta.listed,
    salt: meta.listed ? meta.salt : undefined,
  });
}

/** Paso 3: confirma contra la cadena (el servidor verifica factory + creador + huella). Reintentable. */
export function confirmMeta(address: string, fingerprintHex: string, txHash?: string) {
  return postMeta({ action: "confirm", address, fingerprintHex, txHash });
}

type Phase = (phase: "signing" | "pending") => void;

/** Espera la tx y devuelve su valor de retorno. */
async function returnValueFromTx(hash: string): Promise<unknown> {
  const server = new rpc.Server(NETWORK.rpcUrl, { allowHttp: true });
  const deadline = Date.now() + 90_000;
  for (;;) {
    const r = await server.getTransaction(hash).catch(() => null);
    if (r && r.status === "SUCCESS") {
      if (!r.returnValue) return undefined;
      return scValToNative(r.returnValue);
    }
    if (r && r.status === "FAILED") throw new SendError("The network rejected the transaction.");
    if (Date.now() > deadline)
      throw new SendError("Timed out waiting for the network. Check your wallet activity before retrying.");
    await new Promise((res) => setTimeout(res, 2000));
  }
}

export async function createChestOnChain(
  player: Player,
  input: CreateInput,
  onPhase?: Phase,
): Promise<{ address: string; hash: string }> {
  const bad = scheduleError(input.prizes);
  if (bad) throw new SendError(bad);
  if (!Number.isInteger(input.days) || input.days < 1)
    throw new SendError("Duration must be a whole number of days, at least 1."); // el máximo lo fija el contrato
  if (!input.question.trim()) throw new SendError("The puzzle text is required.");
  const hash = await invoke(
    player,
    FACTORY.contract,
    "create_chest",
    createArgs(player.publicKey, input.question.trim(), input.fingerprintHex, input.prizes, input.days),
    onPhase,
  );
  const address = await returnValueFromTx(hash);
  if (typeof address !== "string") throw new SendError("The chest was created but its address couldn’t be read.");
  return { address, hash };
}

/** El creador cierra su cofre (cuando quiera): premio sin reclamar + reserva de fees no usada vuelven a él. */
export async function closeChestOnChain(
  player: Player,
  chestAddress: string,
  onPhase?: Phase,
): Promise<{ hash: string; refunded: bigint }> {
  const hash = await invoke(
    player,
    FACTORY.contract,
    "close",
    [xdr.ScVal.scvAddress(Address.fromString(chestAddress).toScAddress())],
    onPhase,
  );
  return { hash, refunded: BigInt((await returnValueFromTx(hash)) as bigint) };
}

/**
 * Cofres legacy (contrato registry): el creador cierra uno vencido y recupera el premio sin reclamar.
 * El contrato solo permite cerrar si venció o se agotó (`StillActive` si no).
 */
export async function closeLegacyChestOnChain(
  player: Player,
  chestId: number,
  onPhase?: Phase,
): Promise<{ hash: string; refunded: bigint }> {
  const hash = await invoke(
    player,
    CONTRACTS.chest,
    "close_chest",
    [nativeToScVal(BigInt(chestId), { type: "u64" })],
    onPhase,
  );
  return { hash, refunded: BigInt((await returnValueFromTx(hash)) as bigint) };
}

/** Firma con la cuenta de sesión y envía; devuelve el hash. G por RPC, C por passkey + relayer. */
async function invoke(
  player: Player,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  onPhase?: Phase,
): Promise<string> {
  if (player.kind === "passkey") return invokePasskey(player, contractId, method, args, onPhase);

  let signTransaction: contract.SignTransaction;
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

  const at = await contract.AssembledTransaction.build({
    contractId,
    method,
    args,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.rpcUrl,
    allowHttp: true,
    publicKey: player.publicKey,
    signTransaction,
    fee: "10000000",
    timeoutInSeconds: 120,
    parseResultXdr: (v: xdr.ScVal) => scValToNative(v),
  } as never);
  onPhase?.("signing");
  await at.sign();
  onPhase?.("pending");
  const sent = await at.send();
  const hash = (sent as unknown as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash;
  if (!hash) throw new SendError("The network didn’t return a transaction hash.");
  return hash;
}

async function invokePasskey(
  player: Player,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  onPhase?: Phase,
): Promise<string> {
  const kit = getPasskeyKit();
  if (!kit.keyId || !kit.wallet || kit.wallet.options.contractId !== player.publicKey) {
    try {
      await kit.connectWallet({ keyId: player.keyId });
    } catch (e) {
      console.warn("connectWallet (create):", e); // bug conocido de passkey-kit 0.19 (parche en patches/)
    }
  }
  if (!kit.keyId || !kit.wallet) throw new SendError("Couldn’t unlock your passkey wallet. Try logging in again.");

  const at = await contract.AssembledTransaction.build({
    contractId,
    method,
    args,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.rpcUrl,
    allowHttp: true,
    // cuenta pública cualquiera solo para simular: el relayer rearma el sobre con su propia cuenta
    publicKey: SIM_ACCOUNT,
    parseResultXdr: (v: xdr.ScVal) => scValToNative(v),
  } as never);
  const expiration = (await latestLedgerHint()) + 120;
  onPhase?.("signing");
  const signed = await kit.sign(at as never, undefined, { expiration });
  const xdrStr = (signed as { built?: { toXDR(): string } }).built?.toXDR();
  if (!xdrStr) throw new SendError("Couldn’t build the signed transaction.");
  onPhase?.("pending");
  return submitPasskeyTx(xdrStr);
}

