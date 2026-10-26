import { isChestAllowed } from "./chest-allow";
import { Address, FeeBumpTransaction, Transaction, TransactionBuilder, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * Política del relayer (/api/passkey/send): el servidor paga la fee, así que SOLO retransmite
 * transacciones que invocan NUESTRO contrato registro. Sin imports locales: se testea con vitest.
 *
 *  - registry: create_chest (autorizado por su creador; token = XLM SAC; en mainnet con topes de premio y
 *    plazo) | claim | close_chest (solo cofres cuyo token on-chain es el XLM SAC y, en mainnet, de la lista)
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
  /** Token y creador del cofre leídos on-chain (null = el cofre no existe). */
  chestInfo: (id: number) => Promise<{ token: string; creator: string } | null>;
  /** Mainnet: ids habilitados y creadores aprobados. `allow` ausente (testnet) = sin restricción. */
  allow?: { ids: readonly number[] | null; creators: readonly string[] };
  /** Solo mainnet: topes de create_chest. Sin esto (testnet) no hay topes de premio ni de plazo. */
  createLimits?: { maxPrizeStroops: bigint; maxTotalStroops: bigint; maxDeadlineSecs: number; nowSec: number };
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
    // passkey-kit 0.19 firma con credenciales address-bound (CAP-0071): V2 y with-delegates, además de la V1.
    const ac =
      c.switch().name === "sorobanCredentialsAddress"
        ? c.address()
        : c.switch().name === "sorobanCredentialsAddressV2"
          ? c.addressV2()
          : c.switch().name === "sorobanCredentialsAddressWithDelegates"
            ? c.addressWithDelegates().addressCredentials()
            : null;
    if (ac) out.add(Address.fromScAddress(ac.address()).toString());
  }
  return out;
}

export function declaredResourceFee(tx: Transaction): bigint {
  const ext = tx.toEnvelope().v1().tx().ext();
  return ext.switch() === 1 ? BigInt(ext.sorobanData().resourceFee().toString()) : BigInt(0);
}

export async function checkRelayable(xdrB64: string, passphrase: string, p: RelayPolicy): Promise<RelayVerdict> {
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
      if (args.length !== 6) return no("create_chest: unexpected arguments");
      if (p.allow && !p.allow.creators.includes(creator)) return no("create_chest: creator is not approved on mainnet");
      let token: string, prize: bigint, claims: number, deadline: bigint;
      try {
        token = scAddress(args[2]) ?? "";
        prize = BigInt(scValToNative(args[3]) as bigint);
        claims = Number(scValToNative(args[4]));
        deadline = BigInt(scValToNative(args[5]) as bigint);
      } catch {
        return no("create_chest: unreadable arguments");
      }
      if (token !== p.xlmSac) return no("create_chest: the prize token must be native XLM");
      const L = p.createLimits;
      if (L) {
        if (prize > L.maxPrizeStroops) return no("create_chest: prize per claim above the cap");
        if (prize * BigInt(claims) > L.maxTotalStroops) return no("create_chest: total prize above the cap");
        if (deadline <= BigInt(L.nowSec)) return no("create_chest: the deadline must be in the future");
        if (deadline > BigInt(L.nowSec + L.maxDeadlineSecs)) return no("create_chest: deadline too far away");
      }
      return { ok: true, kind: "create_chest", resourceFee };
    }
    if (method === "claim" || method === "close_chest") {
      let id: number;
      try {
        id = Number(scValToNative(args[0]));
      } catch {
        return no(`${method}: unreadable chest id`);
      }
      if (!Number.isSafeInteger(id) || id < 1) return no(`${method}: bad chest id`);
      const info = await p.chestInfo(id);
      if (info === null) return no(`${method}: chest ${id} not found`);
      if (info.token !== p.xlmSac) return no(`${method}: chest ${id} does not pay native XLM`);
      // mainnet: id habilitado O creador ON-CHAIN aprobado (cualquiera puede crear el cofre #1 en el registro público)
      if (p.allow && !isChestAllowed({ restricted: true, ids: p.allow.ids, creators: p.allow.creators }, id, info.creator))
        return no(`${method}: chest ${id} is not enabled on mainnet`);
      return { ok: true, kind: method, resourceFee };
    }
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
