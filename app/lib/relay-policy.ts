import { Address, FeeBumpTransaction, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

/**
 * Política del relayer (/api/passkey/send): el servidor paga la fee, así que SOLO retransmite
 * transacciones que invocan NUESTRO contrato registro. Sin imports locales: se testea con vitest.
 *
 *  - registry: create_chest (autorizado por su creador) | claim | close_chest
 *  - SAC del XLM: transfer cuyo `from` es la wallet que autoriza la tx (credencial de address)
 *  - deploy de la wallet passkey (CreateContract) con el wasm canónico
 * Una sola operación, sin auth de source-account, sin fee-bump.
 */
export type RelayPolicy = {
  registry: string;
  xlmSac: string;
  walletWasmHashHex: string;
  /** Cuenta del relayer: ninguna tx puede usarla como fuente (op o tx). */
  relayerPublicKey?: string;
};

export type RelayVerdict =
  | { ok: true; kind: "create_chest" | "claim" | "close_chest" | "transfer" | "wallet_deploy"; resourceFee: bigint }
  | { ok: false; reason: string };

const no = (reason: string): RelayVerdict => ({ ok: false, reason });

const scAddress = (v: xdr.ScVal): string | null => {
  try {
    return v.switch().name === "scvAddress" ? Address.fromScVal(v).toString() : null;
  } catch {
    return null;
  }
};

/** Direcciones que autorizan la tx con credenciales de address (la wallet del usuario). */
function authorizers(auth: xdr.SorobanAuthorizationEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of auth) {
    const c = e.credentials();
    if (c.switch().name === "sorobanCredentialsAddress") {
      out.add(Address.fromScAddress(c.address().address()).toString());
    }
  }
  return out;
}

export function declaredResourceFee(tx: Transaction): bigint {
  const ext = tx.toEnvelope().v1().tx().ext();
  return ext.switch() === 1 ? BigInt(ext.sorobanData().resourceFee().toString()) : BigInt(0);
}

export function checkRelayable(xdrB64: string, passphrase: string, p: RelayPolicy): RelayVerdict {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdrB64, passphrase);
  } catch {
    return no("invalid transaction");
  }
  if (parsed instanceof FeeBumpTransaction) return no("fee-bump envelopes are not relayed");
  const tx = parsed;
  if (tx.operations.length !== 1) return no("exactly one operation is allowed");
  if (p.relayerPublicKey && tx.source === p.relayerPublicKey) return no("relayer account cannot be the source");
  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction") return no("only Soroban invocations are relayed");
  if (op.source && p.relayerPublicKey && op.source === p.relayerPublicKey) return no("relayer account cannot be the source");
  const auth = op.auth ?? [];
  if (auth.some((a) => a.credentials().switch().name === "sorobanCredentialsSourceAccount")) {
    return no("source-account authorization is not allowed");
  }
  const resourceFee = declaredResourceFee(tx);
  const fn = op.func;

  if (fn.switch().name === "hostFunctionTypeCreateContract" || fn.switch().name === "hostFunctionTypeCreateContractV2") {
    const args = fn.switch().name === "hostFunctionTypeCreateContract" ? fn.createContract() : fn.createContractV2();
    const exe = args.executable();
    if (exe.switch().name !== "contractExecutableWasm") return no("only wasm contracts can be deployed");
    if (exe.wasmHash().toString("hex") !== p.walletWasmHashHex.toLowerCase()) return no("wasm hash is not the Loot wallet");
    return { ok: true, kind: "wallet_deploy", resourceFee };
  }

  if (fn.switch().name !== "hostFunctionTypeInvokeContract") return no("host function not allowed");
  const inv = fn.invokeContract();
  const contract = Address.fromScAddress(inv.contractAddress()).toString();
  const method = inv.functionName().toString();
  const args = inv.args();

  if (contract === p.registry) {
    if (method === "create_chest") {
      const creator = args[0] ? scAddress(args[0]) : null;
      if (!creator || !authorizers(auth).has(creator)) return no("create_chest must be authorized by its creator");
      return { ok: true, kind: "create_chest", resourceFee };
    }
    if (method === "claim" || method === "close_chest") return { ok: true, kind: method, resourceFee };
    return no(`registry.${method} is not relayed`);
  }

  if (contract === p.xlmSac) {
    if (method !== "transfer") return no(`token.${method} is not relayed`);
    const from = args[0] ? scAddress(args[0]) : null;
    if (!from || !authorizers(auth).has(from)) return no("transfer must be authorized by its sender");
    return { ok: true, kind: "transfer", resourceFee };
  }

  return no("contract or function not allowed");
}
