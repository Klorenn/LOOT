import { Address, Keypair, rpc, xdr } from "@stellar/stellar-sdk";
import { cfgFor } from "./cfg";
import { relayerSecretFor } from "./relay-guard";
import { relayerBalance, sponsorStatus, type SponsorStatus } from "./relay-limits";
import { KUYFI_TWINS, MAINNET_RECORD } from "./mainnet-record";
import type { NetConfig } from "./network";

/** Hash del wasm que ejecuta un contrato (getLedgerEntries sobre su instancia), con el RPC de ESA red. null si no se pudo leer. */
export async function wasmHashOf(c: NetConfig, contractId: string): Promise<string | null> {
  if (!contractId) return null;
  try {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );
    for (const url of c.NETWORK.rpcUrls) {
      try {
        const r = await new rpc.Server(url).getLedgerEntries(key);
        const exe = r.entries[0]?.val.contractData().val().instance().executable();
        if (exe && exe.switch().name === "contractExecutableWasm") return exe.wasmHash().toString("hex");
      } catch {
        /* siguiente RPC */
      }
    }
  } catch {
    /* id inválido */
  }
  return null;
}

export type NetworkFacts = {
  relayer: { address: string | null; balanceXlm: string | null; status: SponsorStatus | null };
  wasm: { registry: string | null; verifier: string | null };
  /** Gemelos Kuyfi en testnet: wasm leído en vivo y si es idéntico al de mainnet (null = no se pudo comprobar). */
  twins: {
    registry: { wasm: string | null; same: boolean | null };
    verifier: { wasm: string | null; same: boolean | null };
  };
};

export async function networkFacts(c: NetConfig): Promise<NetworkFacts> {
  const secret = relayerSecretFor(c);
  const address = secret
    ? Keypair.fromSecret(secret).publicKey()
    : c.IS_MAINNET
      ? process.env.RELAYER_ACCOUNT_MAINNET || MAINNET_RECORD.relayer
      : null;
  const [bal, status, registry, verifier, twinReg, twinVer] = await Promise.all([
    address ? relayerBalance(c, address).catch(() => null) : null,
    sponsorStatus(c, address ?? undefined).catch(() => null),
    wasmHashOf(c, c.CONTRACTS.chest),
    wasmHashOf(c, c.CONTRACTS.verifier),
    wasmHashOf(cfgFor("testnet"), KUYFI_TWINS.registry),
    wasmHashOf(cfgFor("testnet"), KUYFI_TWINS.verifier),
  ]);
  return {
    relayer: { address, balanceXlm: bal === null ? null : (Number(bal) / 1e7).toFixed(2), status },
    wasm: { registry, verifier },
    twins: {
      registry: { wasm: twinReg, same: registry && twinReg ? registry === twinReg : null },
      verifier: { wasm: twinVer, same: verifier && twinVer ? verifier === twinVer : null },
    },
  };
}
