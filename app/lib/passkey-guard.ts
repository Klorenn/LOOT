import { Address, FeeBumpTransaction, Transaction, TransactionBuilder, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { CONTRACTS, FACTORY, NETWORK, WALLET_WASM_HASH } from "./config";
import { readChest } from "./chain";
import { factoryIndexOf, readFactoryChest } from "./factory";

/**
 * Solo servidor. /api/passkey/send paga la fee con la cuenta del relayer, así que solo retransmite
 * transacciones de una lista cerrada, de una sola operación, con auth de dirección (nunca de la
 * cuenta fuente) y con el costo de recursos acotado:
 *  - Despliegue del smart wallet de passkey: CreateContractV2 con el wasm canónico.
 *  - FACTORY.create_chest(creator, ...) con creator == quien firma.
 *  - FACTORY.close(chest) de un cofre de la factory cuyo creator == quien firma.
 *  - Registry legacy: close_chest(id) de un cofre cuyo creator == quien firma.
 *  - SAC del XLM: transfer(from, ...) con from == quien firma (envíos desde /wallet).
 * Cualquier otra cosa (fee-bumps, ops clásicas, otros contratos) se rechaza.
 */

export class GuardError extends Error {}

/** Tope de costo de recursos que el relayer acepta pagar por tx (stroops): 2 XLM. */
export const MAX_RESOURCE_FEE = BigInt(20_000_000);

const bad = (why: string): never => {
  throw new GuardError(why);
};

const fnName = (f: Buffer | string) => (typeof f === "string" ? f : f.toString("utf8"));

function credentialAddresses(op: { auth?: xdr.SorobanAuthorizationEntry[] }): string[] {
  const out: string[] = [];
  for (const entry of op.auth ?? []) {
    const c = entry.credentials();
    const kind = c.switch().name;
    // Protocolo 29 firma con credenciales de dirección V2; las de cuenta fuente o con delegados no se aceptan.
    if (kind === "sorobanCredentialsAddress") {
      out.push(Address.fromScAddress(c.address().address()).toString());
    } else if (kind === "sorobanCredentialsAddressV2") {
      out.push(Address.fromScAddress(c.addressV2().address()).toString());
    } else {
      bad("auth credentials not allowed");
    }
  }
  return out;
}

const argAddress = (v: xdr.ScVal | undefined): string => {
  if (!v || v.switch().name !== "scvAddress") return bad("arg not an address");
  return Address.fromScAddress(v.address()).toString();
};

/** Valida la forma de la tx; lanza GuardError si no está permitida. */
export async function assertAllowedPasskeyTx(xdrStr: string): Promise<Transaction> {
  let parsed;
  try {
    parsed = TransactionBuilder.fromXDR(xdrStr, NETWORK.passphrase);
  } catch {
    return bad("unparseable");
  }
  if (parsed instanceof FeeBumpTransaction) return bad("fee-bump not allowed");
  const tx = parsed as Transaction;
  if (tx.operations.length !== 1) bad("one operation only");
  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction") return bad("not a contract op");

  const signers = [...new Set(credentialAddresses(op))];
  if (signers.length !== 1) bad("exactly one signer expected");
  const signer = signers[0];

  const fn = op.func;
  switch (fn.switch().name) {
    case "hostFunctionTypeCreateContractV2": {
      const exe = fn.createContractV2().executable();
      if (exe.switch().name !== "contractExecutableWasm") bad("not a wasm deploy");
      if (exe.wasmHash().toString("hex") !== WALLET_WASM_HASH) bad("unexpected wasm");
      break;
    }
    case "hostFunctionTypeInvokeContract": {
      const inv = fn.invokeContract();
      const contract = Address.fromScAddress(inv.contractAddress()).toString();
      const name = fnName(inv.functionName() as unknown as Buffer | string);
      const args = inv.args();
      if (args.length < 1) bad("missing args");
      if (contract === FACTORY.contract && name === "create_chest") {
        if (argAddress(args[0]) !== signer) bad("creator is not the signer");
      } else if (contract === FACTORY.contract && name === "close") {
        const chest = argAddress(args[0]);
        const idx = await factoryIndexOf(chest);
        if (idx === null) bad("not a factory chest");
        const info = await readFactoryChest(chest, idx as number);
        if (info.creator !== signer) bad("not the chest creator");
      } else if (contract === CONTRACTS.chest && name === "close_chest") {
        // cofre legacy: el creador cierra el suyo
        const id = Number(scValToNative(args[0]));
        if (!Number.isSafeInteger(id) || id < 0) bad("bad chest id");
        const info = await readChest(id).catch(() => null);
        if (!info || info.creator !== signer) bad("not the chest creator");
      } else if (contract === CONTRACTS.token && name === "transfer") {
        if (argAddress(args[0]) !== signer) bad("from is not the signer");
      } else {
        bad("call not allowed");
      }
      break;
    }
    default:
      bad("host function not allowed");
  }
  return tx;
}

/** Simula la tx tal cual llegó y exige que el costo de recursos esté bajo el tope. */
export async function assertResourceCap(tx: Transaction, rpcUrl: string): Promise<void> {
  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) bad("simulation failed");
  if (Api.isSimulationRestore(sim)) bad("needs restore");
  if (BigInt((sim as Api.SimulateTransactionSuccessResponse).minResourceFee) > MAX_RESOURCE_FEE) {
    bad("resource fee above cap");
  }
}

