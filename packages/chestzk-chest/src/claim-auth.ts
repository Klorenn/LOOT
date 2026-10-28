/**
 * Player-signed claims for registry v2 (`claim` calls `recipient.require_auth()`).
 *
 * The relayer still builds, pays for and submits the transaction (it is the tx source), but the
 * recipient's wallet must sign the Soroban authorization entry of the `claim` call. Flow:
 *
 *   1. relayer: `prepareClaimAuth` simulates `claim` (recording auth) and returns the unsigned entry
 *   2. player:  signs that entry with its wallet (`signClaimAuthEntry` for a G key / SEP-43 wallet,
 *               or passkey-kit `signAuthEntry` for a C smart wallet)
 *   3. relayer: `checkClaimAuthEntry` (it must authorize exactly this claim for this recipient), then
 *               `buildClaimTxWithAuth` (enforcing simulation) -> sign as fee payer -> `sendAndWait`
 *
 * None of this stops one person from using several addresses (sybil): the contract only stops the SAME
 * address from claiming twice in a group.
 */
import { Buffer } from "buffer";
import {
  Address,
  Keypair,
  Operation,
  TransactionBuilder,
  authorizeEntry,
  inspectAuthEntry,
  nativeToScVal,
  xdr,
  type SigningCallback,
  type Transaction,
} from "@stellar/stellar-sdk";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";

export type ClaimArgs = {
  chestId: bigint;
  recipient: string;
  nullifier: Buffer | Uint8Array;
  proof: { a: Buffer | Uint8Array; b: Buffer | Uint8Array; c: Buffer | Uint8Array };
};

const bytes = (b: Buffer | Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(b));

/** `claim(chest_id: u64, recipient: Address, nullifier: BytesN<32>, proof: Proof)` as ScVals. */
export function claimArgsToScVals(a: ClaimArgs): xdr.ScVal[] {
  if (a.nullifier.length !== 32) throw new Error("nullifier must be 32 bytes");
  if (a.proof.a.length !== 64 || a.proof.b.length !== 128 || a.proof.c.length !== 64) throw new Error("bad proof size");
  const field = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
  return [
    nativeToScVal(a.chestId, { type: "u64" }),
    new Address(a.recipient).toScVal(),
    bytes(a.nullifier),
    // contracttype struct -> map with keys sorted by name
    xdr.ScVal.scvMap([field("a", bytes(a.proof.a)), field("b", bytes(a.proof.b)), field("c", bytes(a.proof.c))]),
  ];
}

function claimOp(contractId: string, args: ClaimArgs, auth: xdr.SorobanAuthorizationEntry[] = []) {
  return Operation.invokeContractFunction({ contract: contractId, function: "claim", args: claimArgsToScVals(args), auth });
}

async function buildTx(server: Server, o: TxOpts, auth: xdr.SorobanAuthorizationEntry[]): Promise<Transaction> {
  const account = await server.getAccount(o.source);
  return new TransactionBuilder(account, { fee: o.fee ?? "100", networkPassphrase: o.networkPassphrase })
    .addOperation(claimOp(o.contractId, o.args, auth))
    .setTimeout(o.timeoutInSeconds ?? 120)
    .build();
}

export type TxOpts = {
  networkPassphrase: string;
  contractId: string;
  /** Fee payer / tx source (the relayer's G address). */
  source: string;
  args: ClaimArgs;
  /** Inclusion fee in stroops (resource fee is added from the simulation). */
  fee?: string;
  timeoutInSeconds?: number;
};

/** A simulation error carries the contract code as "Error(Contract, #N)" in its message. */
export class ClaimSimulationError extends Error {}

/** Default signature lifetime: ~60 ledgers (about 5 minutes). */
export const AUTH_VALID_LEDGERS = 60;

/**
 * Simulate `claim` with the relayer as source and return the recipient's UNSIGNED auth entry (base64 XDR).
 * Fails with ClaimSimulationError when the contract would reject the claim (e.g. #16 already claimed,
 * #6 invalid proof), so the player is not asked to sign a claim that cannot land.
 */
export async function prepareClaimAuth(
  server: Server,
  o: TxOpts,
): Promise<{ authEntry: string; latestLedger: number; validUntilLedger: number }> {
  const tx = await buildTx(server, o, []);
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new ClaimSimulationError(sim.error);
  const entries = sim.result?.auth ?? [];
  const mine = entries.filter((e) => inspectAuthEntry(e).address === o.args.recipient);
  if (mine.length !== 1 || entries.length !== 1) {
    throw new Error(`expected exactly one auth entry for the recipient, got ${entries.length}`);
  }
  return {
    authEntry: mine[0].toXDR("base64"),
    latestLedger: sim.latestLedger,
    validUntilLedger: sim.latestLedger + AUTH_VALID_LEDGERS,
  };
}

/**
 * Sign the claim auth entry. `signer` is a Keypair (demo key) or a callback that signs the preimage
 * (a SEP-43 wallet's `signAuthEntry(preimage.toXDR("base64"))`, returning the signature bytes).
 */
export async function signClaimAuthEntry(
  authEntryXdr: string,
  signer: Keypair | SigningCallback,
  validUntilLedger: number,
  networkPassphrase: string,
): Promise<string> {
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
  const signed = await authorizeEntry(entry, signer, validUntilLedger, networkPassphrase);
  return signed.toXDR("base64");
}

/**
 * Relayer-side check of a (signed) entry: it must be an address credential for `recipient` that
 * authorizes exactly `contractId.claim(args)` and nothing else (no sub-invocations).
 * Returns the parsed entry. Throws on anything else.
 */
export function checkClaimAuthEntry(
  authEntryXdr: string,
  o: { contractId: string; args: ClaimArgs; currentLedger?: number },
): xdr.SorobanAuthorizationEntry {
  let entry: xdr.SorobanAuthorizationEntry;
  try {
    entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
  } catch {
    throw new Error("auth entry is not valid XDR");
  }
  const info = inspectAuthEntry(entry);
  if (info.credentialType !== "address" && info.credentialType !== "addressV2") {
    throw new Error(`auth entry must use address credentials, got ${info.credentialType}`);
  }
  if (info.address !== o.args.recipient) throw new Error("auth entry is not signed for the recipient");
  if (!info.signed) throw new Error("auth entry is not signed");
  if (o.currentLedger !== undefined && (info.signatureExpirationLedger ?? 0) <= o.currentLedger) {
    throw new Error("auth entry signature expired");
  }
  const inv = info.invocation;
  if (inv.subInvocations().length !== 0) throw new Error("auth entry must not authorize sub-invocations");
  const fn = inv.function();
  if (fn.switch().name !== "sorobanAuthorizedFunctionTypeContractFn") throw new Error("auth entry is not a contract call");
  const call = fn.contractFn();
  if (Address.fromScAddress(call.contractAddress()).toString() !== o.contractId) throw new Error("auth entry targets another contract");
  if (call.functionName().toString() !== "claim") throw new Error("auth entry is not for claim");
  const want = claimArgsToScVals(o.args).map((v) => v.toXDR("base64"));
  const got = call.args().map((v) => v.toXDR("base64"));
  if (want.length !== got.length || want.some((w, i) => w !== got[i])) throw new Error("auth entry arguments differ from the claim");
  return entry;
}

/**
 * Build the final claim tx carrying the player's signed auth entry, simulate it in ENFORCING mode
 * (the signature is checked) and assemble it. Unsigned: the relayer signs it as fee payer.
 * `resourceFee` is the simulated resource fee in stroops; total fee = inclusion + resourceFee.
 */
export async function buildClaimTxWithAuth(
  server: Server,
  o: TxOpts & { auth: xdr.SorobanAuthorizationEntry; instructionLeeway?: number },
): Promise<{ tx: Transaction; resourceFee: bigint }> {
  const raw = await buildTx(server, o, [o.auth]);
  const sim = await server.simulateTransaction(
    raw,
    o.instructionLeeway ? { cpuInstructions: o.instructionLeeway } : undefined,
  );
  if (Api.isSimulationError(sim)) throw new ClaimSimulationError(sim.error);
  if (!Api.isSimulationSuccess(sim)) throw new ClaimSimulationError("simulation needs a restore");
  const tx = assembleTransaction(raw, sim).build();
  // assembleTransaction keeps the op's existing (signed) auth; make sure nothing replaced it.
  const op = tx.operations[0] as Operation.InvokeHostFunction;
  if ((op.auth ?? []).length !== 1 || op.auth![0].toXDR("base64") !== o.auth.toXDR("base64")) {
    throw new Error("assembled claim lost the signed auth entry");
  }
  return { tx, resourceFee: BigInt(sim.minResourceFee) };
}

/** Submit a signed tx and wait for the result. Throws "TRY_AGAIN_LATER" so callers can bump the fee. */
export async function sendAndWait(
  server: Server,
  tx: Transaction,
  timeoutMs = 60_000,
): Promise<{ hash: string; ledger: number | null; status: string }> {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "TRY_AGAIN_LATER") throw new Error("TRY_AGAIN_LATER");
  if (sent.status === "ERROR") {
    throw new Error(`send failed: ${sent.errorResult?.result().switch().name ?? "ERROR"}`);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await server.getTransaction(sent.hash);
    if (r.status === Api.GetTransactionStatus.SUCCESS) return { hash: sent.hash, ledger: r.ledger, status: r.status };
    if (r.status === Api.GetTransactionStatus.FAILED) {
      const e = new Error(`transaction ${sent.hash} failed`) as Error & { hash?: string };
      e.hash = sent.hash;
      throw e;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  const e = new Error(`transaction ${sent.hash} not confirmed in time`) as Error & { hash?: string };
  e.hash = sent.hash;
  throw e;
}
