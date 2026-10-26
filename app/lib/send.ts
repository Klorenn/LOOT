"use client";

import {
  Account,
  Address,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
  Asset,
} from "@stellar/stellar-sdk";
import { contract } from "@stellar/stellar-sdk";
import { latestLedgerHint } from "./chain";
import { CONTRACTS, NETWORK, PRIZE } from "./config";
import { getPasskeyKit } from "./passkey-client";
import { submitPasskeyTx, type Player } from "./wallet";
import { signWithWallet } from "./wallets-kit";

/**
 * Enviar XLM desde la sesión. Reglas verificadas en developers.stellar.org:
 *  - Una tx con InvokeHostFunction NO puede llevar memo (MEMO_NONE) ni cuenta fuente multiplexada.
 *    https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction
 *  - Desde Protocolo 23 (CAP-67) el `to` de transfer del SAC es un MuxedAddress (M…); el id hace de
 *    memo y no cambia nada en el ledger. https://developers.stellar.org/docs/tokens/stellar-asset-contract
 *  - Transferir a una cuenta G inexistente falla (AccountMissing): un transfer no crea cuentas.
 * Por eso: cuentas G → payment/createAccount clásico con memo; cuentas C (passkey) → SAC transfer,
 * y el "memo" solo existe como id de M….
 */

/** Error con texto ya pensado para el usuario (no se re-interpreta en la UI). */
export class SendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendError";
  }
}

export type MemoInput =
  | { type: "none" }
  | { type: "text"; value: string }
  | { type: "id"; value: string }
  | { type: "hash"; value: string };

export type Destination = {
  /** G… / C… / M… tal cual lo escribió el usuario (recortado) */
  input: string;
  kind: "G" | "C" | "M";
  /** Para M…: la cuenta G base y el id */
  baseG?: string;
  muxId?: string;
};

export const MUX_PROTOCOL_NOTE =
  "Muxed (M…) addresses are supported by the Stellar Asset Contract since Protocol 23.";

export function parseDestination(raw: string): Destination | { error: string } {
  const input = raw.trim();
  if (!input) return { error: "Enter a destination address." };
  if (StrKey.isValidEd25519PublicKey(input)) return { input, kind: "G" };
  if (StrKey.isValidContract(input)) return { input, kind: "C" };
  if (StrKey.isValidMed25519PublicKey(input)) {
    const raw40 = StrKey.decodeMed25519PublicKey(input);
    const baseG = StrKey.encodeEd25519PublicKey(Buffer.from(raw40.subarray(0, 32)));
    const id = BigInt("0x" + Buffer.from(raw40.subarray(32)).toString("hex")).toString();
    return { input, kind: "M", baseG, muxId: id };
  }
  return { error: "That isn’t a valid Stellar address (G…, C… or M…)." };
}

/** "1.5" → 15000000n; null si tiene más de 7 decimales, es ≤ 0 o no es numérico. */
export function parseXlmAmount(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const v = BigInt(w) * BigInt(10 ** PRIZE.decimals) + BigInt(f.padEnd(PRIZE.decimals, "0"));
  return v > BigInt(0) ? v : null;
}

export function validateMemo(m: MemoInput, dest: Destination): string | null {
  if (m.type === "none") return null;
  if (dest.kind === "M") return "An M… address already carries an id: remove the memo.";
  if (m.type === "text") {
    if (!m.value) return "Enter the memo text or choose “None”.";
    if (new TextEncoder().encode(m.value).length > 28) return "Memo text can be at most 28 bytes.";
  } else if (m.type === "hash") {
    if (!/^[0-9a-fA-F]{64}$/.test(m.value)) return "Memo hash must be 32 bytes (64 hex characters).";
  } else {
    if (!/^\d{1,20}$/.test(m.value)) return "Memo ID must be a whole number.";
    if (BigInt(m.value) > BigInt("18446744073709551615")) return "Memo ID is too large (max 2^64−1).";
  }
  return null;
}

const horizon = () => new Horizon.Server(NETWORK.horizonUrl);

async function loadG(addr: string) {
  try {
    return await horizon().loadAccount(addr);
  } catch (e) {
    const err = e as { name?: string; response?: { status?: number }; status?: number; message?: string };
    if (err?.response?.status === 404 || err?.status === 404 || err?.name === "NotFoundError" || /not found/i.test(err?.message ?? ""))
      return null;
    throw e;
  }
}

const XLM = BigInt(10) ** BigInt(PRIZE.decimals);
const toStroops = (decimal: string) => {
  const [w, f = ""] = decimal.split(".");
  return BigInt(w) * XLM + BigInt(f.padEnd(7, "0").slice(0, 7));
};

/** Saldo y máximo enviable (stroops). G: saldo − reserva mínima − liabilities − 0,01 XLM de colchón de fee. */
export async function balanceInfo(
  player: Player,
): Promise<{ balance: bigint; max: bigint; reserve: bigint }> {
  if (player.kind === "passkey") {
    const { readPrizeBalance } = await import("./chain");
    const b = await readPrizeBalance(player.publicKey);
    return { balance: b, max: b, reserve: BigInt(0) }; // el relayer paga las fees: se puede enviar todo
  }
  const acc = await loadG(player.publicKey);
  if (!acc) return { balance: BigInt(0), max: BigInt(0), reserve: BigInt(0) };
  const native = acc.balances.find((b) => b.asset_type === "native");
  const balance = toStroops(native?.balance ?? "0");
  const liabilities = toStroops(
    (native as { selling_liabilities?: string } | undefined)?.selling_liabilities ?? "0",
  );
  const a = acc as unknown as {
    subentry_count?: number;
    num_sponsoring?: number;
    num_sponsored?: number;
  };
  const entries = 2 + (a.subentry_count ?? 0) + (a.num_sponsoring ?? 0) - (a.num_sponsored ?? 0);
  const reserve = BigInt(Math.max(2, entries)) * (XLM / BigInt(2));
  const buffer = XLM / BigInt(100);
  const max = balance - reserve - liabilities - buffer;
  return { balance, max: max > BigInt(0) ? max : BigInt(0), reserve };
}

export type Plan = {
  /** Cómo se enviará (para la pantalla de revisión) */
  method: "payment" | "createAccount" | "sac-transfer";
  /** Avisos que deben verse antes de confirmar */
  notes: string[];
  feeNote: string;
};

/** Valida contra la cadena y explica qué se va a hacer. Lanza Error con texto para el usuario. */
export async function planSend(
  player: Player,
  dest: Destination,
  amount: bigint,
  memo: MemoInput,
): Promise<Plan> {
  const memoErr = validateMemo(memo, dest);
  if (memoErr) throw new SendError(memoErr);

  if (player.kind === "passkey") {
    const notes: string[] = [];
    if (memo.type === "text" || memo.type === "hash")
      throw new SendError(
        "Smart account: ID memos only. Text and hash memos need a G… wallet. For exchanges that require a memo, use an M… address.",
      );
    if (memo.type === "id") {
      if (dest.kind !== "G") throw new SendError("A memo ID needs a G… destination (it becomes an M… address).");
      notes.push(`The memo ID ${memo.value} is sent as an M… address (${MUX_PROTOCOL_NOTE}).`);
    }
    if (dest.kind === "C" && dest.baseG) throw new SendError("Unsupported destination.");
    const baseG = dest.kind === "G" ? dest.input : dest.kind === "M" ? dest.baseG! : null;
    if (baseG && !(await loadG(baseG))) {
      throw new SendError(
        "That account doesn’t exist on the network yet. A passkey wallet can’t create accounts: fund it first from a G… wallet or an exchange / faucet.",
      );
    }
    const { balance } = await balanceInfo(player);
    if (amount > balance) throw new SendError("Insufficient balance.");
    return { method: "sac-transfer", notes, feeNote: "Network fee paid by the Loot relayer." };
  }

  // Cuentas G
  const { balance, max } = await balanceInfo(player);
  if (amount > balance) throw new SendError("Insufficient balance.");
  if (amount > max)
    throw new SendError("That would dip below the account’s minimum reserve. Lower the amount or press Max.");
  if (dest.kind === "C")
    throw new SendError("Sending to a contract (C…) address isn’t supported from a G… account here.");
  const baseG = dest.kind === "M" ? dest.baseG! : dest.input;
  const exists = !!(await loadG(baseG));
  if (!exists) {
    if (dest.kind === "M") throw new SendError("The account behind that M… address doesn’t exist yet.");
    if (amount < XLM)
      throw new SendError("That account doesn’t exist yet. Send at least 1 XLM to create it.");
    return {
      method: "createAccount",
      notes: ["The destination doesn’t exist yet: this creates the account with your XLM (min 1 XLM)."],
      feeNote: "Network fee ~0.00001 XLM, paid from your account.",
    };
  }
  return { method: "payment", notes: [], feeNote: "Network fee ~0.00001 XLM, paid from your account." };
}

function toMemo(m: MemoInput): Memo {
  if (m.type === "text") return Memo.text(m.value);
  if (m.type === "id") return Memo.id(m.value);
  if (m.type === "hash") return Memo.hash(m.value.toLowerCase());
  return Memo.none();
}

/** Ejecuta el envío y devuelve el hash. Vuelve a planificar antes de firmar. */
export async function sendXlm(
  player: Player,
  dest: Destination,
  amount: bigint,
  memo: MemoInput,
  onPhase?: (phase: "signing" | "pending") => void,
): Promise<{ hash: string }> {
  const plan = await planSend(player, dest, amount, memo);
  if (player.kind === "passkey") return sendFromPasskey(player, dest, amount, memo, onPhase);

  const acc = await horizon().loadAccount(player.publicKey);
  const b = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase });
  const amountStr = `${amount / XLM}.${(amount % XLM).toString().padStart(7, "0")}`;
  if (plan.method === "createAccount") {
    b.addOperation(Operation.createAccount({ destination: dest.input, startingBalance: amountStr }));
  } else {
    b.addOperation(
      Operation.payment({ destination: dest.input, asset: Asset.native(), amount: amountStr }),
    );
  }
  b.addMemo(toMemo(memo)).setTimeout(120);
  const tx = b.build();

  let signedXdr: string;
  onPhase?.("signing");
  if (player.kind === "classic" && player.secretKey) {
    tx.sign(Keypair.fromSecret(player.secretKey));
    signedXdr = tx.toXDR();
  } else if (player.kind === "wallet" && player.walletId) {
    signedXdr = await signWithWallet(tx.toXDR(), player.publicKey, player.walletId, NETWORK.passphrase);
  } else {
    throw new SendError("This session can’t sign transactions.");
  }
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);
  onPhase?.("pending");
  const res = await horizon().submitTransaction(signed);
  return { hash: res.hash };
}

function sacTo(dest: Destination, memo: MemoInput): xdr.ScVal {
  if (dest.kind === "M") {
    const raw = StrKey.decodeMed25519PublicKey(dest.input);
    return muxedScVal(Buffer.from(raw.subarray(0, 32)), dest.muxId!);
  }
  if (dest.kind === "G" && memo.type === "id") {
    const g = StrKey.decodeEd25519PublicKey(dest.input);
    return muxedScVal(Buffer.from(g), memo.value);
  }
  return Address.fromString(dest.input).toScVal();
}

const muxedScVal = (ed25519: Buffer, id: string) =>
  xdr.ScVal.scvAddress(
    xdr.ScAddress.scAddressTypeMuxedAccount(
      new xdr.MuxedEd25519Account({ id: xdr.Uint64.fromString(id), ed25519 }),
    ),
  );

/** SAC transfer(from=C, to, amount) firmado con la passkey y enviado por el relayer (/api/passkey/send). */
async function sendFromPasskey(
  player: Player,
  dest: Destination,
  amount: bigint,
  memo: MemoInput,
  onPhase?: (phase: "signing" | "pending") => void,
): Promise<{ hash: string }> {
  const kit = getPasskeyKit();
  // passkey-kit 0.19: connectWallet fija wallet+keyId y luego crashea (bug conocido de expiración
  // nula); el estado queda listo para firmar, así que el error se ignora si el kit ya quedó conectado.
  if (!kit.keyId || !kit.wallet || kit.wallet.options.contractId !== player.publicKey) {
    try {
      await kit.connectWallet({ keyId: player.keyId });
    } catch (e) {
      console.warn("connectWallet (send):", e);
    }
  }
  if (!kit.keyId || !kit.wallet) throw new SendError("Couldn’t unlock your passkey wallet. Try logging in again.");

  const at = await contract.AssembledTransaction.build({
    contractId: CONTRACTS.token,
    method: "transfer",
    args: [
      Address.fromString(player.publicKey).toScVal(),
      sacTo(dest, memo),
      nativeToScVal(amount, { type: "i128" }),
    ],
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.rpcUrl,
    // cuenta pública cualquiera solo para simular: el relayer rearma el sobre con su propia cuenta
    publicKey: "GAKD2FSFFNLBVTUB4JHFYVUUMTKKEEJO2TG77BHV2KCZTDPUB64JU7E2",
    parseResultXdr: () => undefined,
  } as never);

  // La expiración se calcula con nuestro ledger aproximado (getLatestLedger tarda 15–60 s hoy).
  const expiration = (await latestLedgerHint()) + 120;
  onPhase?.("signing");
  const signed = await kit.sign(at as never, undefined, { expiration });
  const xdrStr = (signed as { built?: { toXDR(): string } }).built?.toXDR();
  if (!xdrStr) throw new SendError("Couldn’t build the signed transaction.");
  onPhase?.("pending");
  const hash = await submitPasskeyTx(xdrStr);
  return { hash };
}
