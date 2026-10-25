import { Account, Contract, Keypair, StrKey, Transaction, TransactionBuilder, rpc, scValToNative, xdr, } from "@stellar/stellar-sdk";
import { NETWORK } from "./config.js";
const UINT32_MAX = 0xffffffff;
const INCLUSION = 100;
/** Account used as source for read-only simulations. */
const NULL_ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
export function keypairSigner(kp, opts = {}) {
    const keypair = typeof kp === "string" ? Keypair.fromSecret(kp) : kp;
    const passphrase = opts.networkPassphrase ?? NETWORK.passphrase;
    return {
        publicKey: keypair.publicKey(),
        async signTransaction(txXdr) {
            const tx = TransactionBuilder.fromXDR(txXdr, passphrase);
            tx.sign(keypair);
            return tx.toXDR();
        },
    };
}
export function getRpc(opts = {}) {
    const url = opts.rpcUrl ?? NETWORK.rpcUrl;
    return new rpc.Server(url, { allowHttp: url.startsWith("http://") });
}
/** Simulate a contract call (read, or pre-flight for a write). */
export async function simulate(contractId, method, args, opts = {}) {
    const server = getRpc(opts);
    const source = opts.source ?? NULL_ACCOUNT;
    const account = source === NULL_ACCOUNT
        ? new Account(NULL_ACCOUNT, "0")
        : await server.getAccount(source);
    const tx = new TransactionBuilder(account, {
        fee: String(INCLUSION),
        networkPassphrase: opts.networkPassphrase ?? NETWORK.passphrase,
    })
        .addOperation(new Contract(contractId).call(method, ...args))
        .setTimeout(120)
        .build();
    const sim = await server.simulateTransaction(tx, opts.cpuInstructions ? { cpuInstructions: opts.cpuInstructions } : undefined);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`simulation failed (${method}): ${sim.error}`);
    }
    if (rpc.Api.isSimulationRestore(sim)) {
        throw new Error(`simulation needs a ledger-entry restore first (${method}); restore and retry`);
    }
    const scVal = sim.result?.retval;
    return { retval: scVal ? scValToNative(scVal) : undefined, scVal, sim, tx };
}
export async function read(contractId, method, args = [], opts = {}) {
    return (await simulate(contractId, method, args, opts)).retval;
}
/**
 * Assemble a simulated tx. When the Soroban resource fee alone exceeds uint32
 * (Protocol 29 rent), use the stellar-cli pattern: inner fee 0 with the full
 * resourceFee in the soroban data, wrapped in a fee-bump covering it.
 */
async function assemble(raw, sim, signer, passphrase) {
    const minRf = BigInt(sim.minResourceFee);
    const needsBump = minRf + BigInt(INCLUSION) > BigInt(UINT32_MAX);
    if (!needsBump) {
        const built = rpc.assembleTransaction(raw, sim).build();
        return {
            xdr: await signer.signTransaction(built.toXDR()),
            feeStroops: BigInt(built.fee),
        };
    }
    const sorobanData = sim.transactionData.build();
    sorobanData.resourceFee(xdr.Int64.fromString(String(UINT32_MAX - INCLUSION)));
    let inner = TransactionBuilder.cloneFrom(raw, {
        fee: String(INCLUSION),
        sorobanData,
        networkPassphrase: passphrase,
    }).build();
    const env = inner.toEnvelope();
    const v1 = env.v1();
    v1.tx().fee(0);
    v1.tx().ext().sorobanData().resourceFee(xdr.Int64.fromString(minRf.toString()));
    v1.signatures([]);
    inner = new Transaction(xdr.TransactionEnvelope.envelopeTypeTx(v1), passphrase);
    const signedInner = await signer.signTransaction(inner.toXDR());
    const innerSigned = TransactionBuilder.fromXDR(signedInner, passphrase);
    // fee-bump total = baseFee * (ops + 1) = baseFee * 2
    const total = minRf + BigInt(INCLUSION) * 2n;
    const baseFee = ((total + 1n) / 2n).toString();
    const bump = TransactionBuilder.buildFeeBumpTransaction(signer.publicKey, baseFee, innerSigned, passphrase);
    return {
        xdr: await signer.signTransaction(bump.toXDR()),
        feeStroops: total,
    };
}
/** Simulate, assemble, sign, submit and wait for a contract call. */
export async function invoke(contractId, method, args, signer, opts = {}) {
    const server = getRpc(opts);
    const passphrase = opts.networkPassphrase ?? NETWORK.passphrase;
    const { sim, tx } = await simulate(contractId, method, args, {
        ...opts,
        source: signer.publicKey,
    });
    const { xdr: signedXdr, feeStroops } = await assemble(tx, sim, signer, passphrase);
    let hash;
    if (signer.submit) {
        hash = await signer.submit(signedXdr);
    }
    else {
        const parsed = TransactionBuilder.fromXDR(signedXdr, passphrase);
        const sent = await server.sendTransaction(parsed);
        if (sent.status === "ERROR") {
            throw new Error(`send failed (${method}): ${JSON.stringify(sent.errorResult ?? sent)}`);
        }
        hash = sent.hash;
    }
    const deadline = Date.now() + 90_000;
    for (;;) {
        const r = await server.getTransaction(hash);
        if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            return {
                hash,
                returnValue: r.returnValue ? scValToNative(r.returnValue) : undefined,
                feeStroops,
            };
        }
        if (r.status === rpc.Api.GetTransactionStatus.FAILED) {
            throw new Error(`transaction failed (${method}) ${hash}: ${r.resultXdr?.toXDR("base64")}`);
        }
        if (Date.now() > deadline)
            throw new Error(`timeout waiting for ${hash}`);
        await new Promise((res) => setTimeout(res, 1500));
    }
}
