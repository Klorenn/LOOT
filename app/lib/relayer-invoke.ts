import { Contract, Keypair, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NETWORK } from "./config";
import { withRpcUrl } from "./rpc";

/**
 * Solo servidor. Invoca un contrato con la cuenta del RELAYER como fuente y pagadora de la fee
 * (los claims de la factory: el receptor no firma nada). Failover de escritura solo ante error de
 * red (ver lib/rpc.ts); reenviar la misma tx firmada es idempotente.
 */
export async function invokeAsRelayer(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  opts: { cpuInstructions?: number } = {},
): Promise<{ hash: string; ledger: number | null; returnValue: unknown }> {
  const secret = process.env.RELAYER_SECRET;
  if (!secret) throw new Error("RELAYER_SECRET missing");
  const kp = Keypair.fromSecret(secret);

  return withRpcUrl(
    async (rpcUrl) => {
      const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
      const account = await server.getAccount(kp.publicKey());
      const raw = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: NETWORK.passphrase,
      })
        .addOperation(new Contract(contractId).call(method, ...args))
        .setTimeout(120)
        .build();
      const sim = await server.simulateTransaction(
        raw,
        opts.cpuInstructions ? { cpuInstructions: opts.cpuInstructions } : undefined,
      );
      if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
      if (rpc.Api.isSimulationRestore(sim)) throw new Error("simulation needs a ledger-entry restore");
      const tx = rpc.assembleTransaction(raw, sim).build();
      tx.sign(kp);
      const sent = await server.sendTransaction(tx);
      if (sent.status === "ERROR") {
        throw new Error(`send failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
      }
      const hash = sent.hash;
      const deadline = Date.now() + 90_000;
      for (;;) {
        const r = await server.getTransaction(hash);
        if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          return {
            hash,
            ledger: r.ledger ?? null,
            returnValue: r.returnValue ? scValToNative(r.returnValue) : undefined,
          };
        }
        if (r.status === rpc.Api.GetTransactionStatus.FAILED) {
          const e = r.resultXdr?.toXDR("base64") ?? "";
          throw new Error(`transaction failed ${hash} ${e}`);
        }
        if (Date.now() > deadline) throw new Error(`timeout waiting for ${hash}`);
        await new Promise((res) => setTimeout(res, 1500));
      }
    },
    { write: true },
  );
}
