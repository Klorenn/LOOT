import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, FEES, NETWORK, stroopsToXlm, xlmToStroops, } from "./config.js";
import { invoke, read, simulate } from "./chain.js";
import { normalizeAnswer } from "./normalize.js";
import { addressField, answerToField, fieldToHex, fingerprintAnswer, poseidon2, saltFromQuestion, } from "./fingerprint.js";
import { proveChest } from "./zk.js";
const factoryId = (o) => o?.factory ?? CONTRACTS.factory;
const addr = (a) => new Address(a).toScVal();
const bytes = (hex) => xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
const u32 = (n) => nativeToScVal(n, { type: "u32" });
const i128 = (n) => nativeToScVal(n, { type: "i128" });
const str = (s) => nativeToScVal(s, { type: "string" });
export async function getFactoryConfig(o) {
    const c = await read(factoryId(o), "get_config", [], o);
    return {
        admin: c.admin,
        treasury: c.treasury,
        chestWasmHash: Buffer.from(c.chest_wasm_hash).toString("hex"),
        verifier: c.verifier,
        token: c.token,
        creationFee: c.creation_fee,
        dailyFeeBps: Number(c.daily_fee_bps),
        maxDurationDays: Number(c.max_duration_days),
    };
}
export const MAX_PLACES = 50;
/** Resolve a PrizeSpec to stroop tiers; validates 1..50 places and every amount > 0. */
export function resolvePrizes(p) {
    let tiers;
    if (p.prizesXlm !== undefined) {
        if (p.amountPerSlotXlm !== undefined || p.slots !== undefined) {
            throw new Error("give either prizesXlm or amountPerSlotXlm + slots, not both");
        }
        tiers = p.prizesXlm.map((x) => xlmToStroops(x));
    }
    else {
        if (p.amountPerSlotXlm === undefined || p.slots === undefined) {
            throw new Error("give prizesXlm, or amountPerSlotXlm + slots");
        }
        if (!Number.isInteger(p.slots) || p.slots < 1)
            throw new Error("slots must be an integer >= 1");
        if (p.slots > MAX_PLACES)
            throw new Error(`at most ${MAX_PLACES} places`);
        tiers = Array.from({ length: p.slots }, () => xlmToStroops(p.amountPerSlotXlm));
    }
    if (tiers.length < 1 || tiers.length > MAX_PLACES) {
        throw new Error(`places must be between 1 and ${MAX_PLACES}`);
    }
    if (tiers.some((t) => t <= 0n))
        throw new Error("every prize must be > 0");
    return tiers;
}
const FALLBACK_NETWORK_STROOPS = 5000000n; // 0.5 XLM
/**
 * Breakdown to show BEFORE signing. Pass `creator` (the G… that will pay) to get a
 * simulated network cost; without it a conservative fallback is used.
 */
export async function quoteCreate(p, o) {
    const tiers = resolvePrizes(p);
    validateDays(p.durationDays);
    let cfg;
    try {
        cfg = await getFactoryConfig(o);
    }
    catch {
        cfg = { creationFee: xlmToStroops(FEES.creationFeeXlm), dailyFeeBps: FEES.dailyFeeBps };
    }
    const prize = tiers.reduce((a, b) => a + b, 0n);
    const reserve = (prize * BigInt(cfg.dailyFeeBps) * BigInt(p.durationDays)) / 10000n;
    let network = FALLBACK_NETWORK_STROOPS;
    let fromSim = false;
    if (p.creator) {
        try {
            const question = p.question ?? "quote";
            const { fingerprintHex } = await fingerprintAnswer(p.answer ?? "x", saltFromQuestion(question));
            const { sim } = await simulate(factoryId(o), "create_chest", createArgs(p.creator, question, fingerprintHex, tiers, p.durationDays), { ...o, source: p.creator });
            network = BigInt(sim.minResourceFee) + 100n;
            fromSim = true;
        }
        catch {
            /* creator unfunded or not enough XLM yet: keep the fallback */
        }
    }
    const total = prize + cfg.creationFee + reserve + network;
    return {
        places: tiers.map((t, i) => ({ place: i + 1, amountXlm: stroopsToXlm(t) })),
        prizeXlm: stroopsToXlm(prize),
        creationFeeXlm: stroopsToXlm(cfg.creationFee),
        feeReserveXlm: stroopsToXlm(reserve),
        networkEstimateXlm: stroopsToXlm(network),
        networkEstimateFromSimulation: fromSim,
        totalXlm: stroopsToXlm(total),
        dailyFeeBps: cfg.dailyFeeBps,
        durationDays: p.durationDays,
    };
}
function validateDays(days) {
    if (!Number.isInteger(days) || days < 1 || days > FEES.maxDurationDays) {
        throw new Error(`durationDays must be an integer between 1 and ${FEES.maxDurationDays}`);
    }
}
function createArgs(creator, question, fingerprintHex, tiers, days) {
    return [
        addr(creator),
        str(question),
        bytes(fingerprintHex),
        xdr.ScVal.scvVec(tiers.map((t) => i128(t))),
        u32(days),
    ];
}
// -------------------------------------------------------------------- create
export async function createChest(p) {
    resolvePrizes(p);
    validateDays(p.durationDays);
    if (!p.question.trim())
        throw new Error("question is required");
    if (!normalizeAnswer(p.answer))
        throw new Error("answer is required");
    const { fingerprintHex } = await fingerprintAnswer(p.answer, saltFromQuestion(p.question));
    return createChestFromFingerprint({ ...p, fingerprintHex });
}
/**
 * Same as createChest but with a precomputed fingerprint (hex), so the answer never
 * leaves the browser when a server signs/submits the transaction.
 */
export async function createChestFromFingerprint(p) {
    const tiers = resolvePrizes(p);
    validateDays(p.durationDays);
    if (!p.question.trim())
        throw new Error("question is required");
    const r = await invoke(factoryId(p), "create_chest", createArgs(p.signer.publicKey, p.question, p.fingerprintHex, tiers, p.durationDays), p.signer, p);
    return { chestAddress: String(r.returnValue), txHash: r.hash, fingerprintHex: p.fingerprintHex };
}
export async function getChest(address, o) {
    const [i, balance] = await Promise.all([
        read(address, "get_info", [], o),
        read(address, "balance", [], o),
    ]);
    const expiry = new Date(Number(i.expiry) * 1000);
    const prizes = i.prizes.map((x) => BigInt(x));
    const slots = Number(i.slots);
    const claims = Number(i.claims);
    const closed = Boolean(i.closed);
    return {
        address,
        creator: i.creator,
        question: i.question,
        fingerprintHex: Buffer.from(i.fingerprint).toString("hex"),
        token: i.token,
        treasury: i.treasury,
        verifier: i.verifier,
        prizes,
        prizesXlm: prizes.map(stroopsToXlm),
        slots,
        claims,
        slotsLeft: closed ? 0 : slots - claims,
        nextPlace: closed || claims >= slots
            ? null
            : { place: claims + 1, amountXlm: stroopsToXlm(prizes[claims]), amount: prizes[claims] },
        expiry,
        lastFeeTs: Number(i.last_fee_ts),
        dailyFeeBps: Number(i.daily_fee_bps),
        closed,
        expired: Date.now() > expiry.getTime(),
        balance,
        balanceXlm: stroopsToXlm(balance),
        prizePool: i.prize_pool,
        feeReserve: i.fee_reserve,
    };
}
/** All chest contract addresses created by the factory (oldest first). */
export async function listChests(o) {
    const total = Number(await read(factoryId(o), "chest_count", [], o));
    const out = [];
    const page = 50;
    for (let start = 0; start < total; start += page) {
        const part = await read(factoryId(o), "list_chests", [u32(start), u32(page)], o);
        out.push(...part);
    }
    return out;
}
/** Random 248-bit secret (fits the BN254 field). Keep it if you need to prove the same nullifier again. */
export function randomPlayerSecret() {
    const b = new Uint8Array(31);
    globalThis.crypto.getRandomValues(b);
    return BigInt("0x" + Buffer.from(b).toString("hex"));
}
export class WrongAnswerError extends Error {
    constructor() {
        super("answer does not match the chest fingerprint");
        this.name = "WrongAnswerError";
    }
}
/**
 * Generates the Groth16 proof client-side and submits `claim`.
 * The winner always receives exactly amount_per_slot (fees come from the reserve only).
 */
export async function claim(p) {
    const chest = await getChest(p.chestAddress, p);
    const salt = p.salt ?? saltFromQuestion(chest.question);
    const answerField = answerToField(normalizeAnswer(p.answer));
    const fp = fieldToHex(await poseidon2(answerField, salt));
    if (fp !== chest.fingerprintHex)
        throw new WrongAnswerError();
    const playerSecret = p.playerSecret ?? randomPlayerSecret();
    const proved = await proveChest({
        answer: answerField,
        salt,
        playerSecret,
        chestId: BigInt(addressField(p.chestAddress).decimal),
        recipient: BigInt(addressField(p.recipient).decimal),
    }, p.circuit);
    const { txHash } = await submitClaim({
        chestAddress: p.chestAddress,
        recipient: p.recipient,
        nullifierHex: proved.nullifierHex,
        proof: proved.proof,
        signer: p.signer,
        rpcUrl: p.rpcUrl,
        networkPassphrase: p.networkPassphrase,
    });
    return { txHash, nullifierHex: proved.nullifierHex, playerSecret };
}
/**
 * Submit an already generated proof (e.g. a server relayer receiving it from the browser).
 * The recipient signs nothing; `signer` only pays the fee.
 */
export async function submitClaim(p) {
    const proofScVal = xdr.ScVal.scvMap(["a", "b", "c"].map((k) => new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(k),
        val: xdr.ScVal.scvBytes(Buffer.from(p.proof[k].replace(/^0x/, ""), "hex")),
    })));
    const r = await invoke(p.chestAddress, "claim", [addr(p.recipient), bytes(p.nullifierHex.replace(/^0x/, "")), proofScVal], p.signer, { ...p, cpuInstructions: 100_000_000 });
    return { txHash: r.hash };
}
// --------------------------------------------------------------------- close
/** Creator only. Charges due fees and refunds the remaining balance to the creator. */
export async function close(p) {
    const r = await invoke(p.chestAddress, "close", [], p.signer, p);
    const refunded = BigInt(r.returnValue);
    return { txHash: r.hash, refundedStroops: refunded, refundedXlm: stroopsToXlm(refunded) };
}
/** Public: charge the daily fees already due (anyone can call). */
export async function accrueFees(p) {
    const r = await invoke(p.chestAddress, "accrue_fees", [], p.signer, p);
    return { txHash: r.hash, feeStroops: BigInt(r.returnValue) };
}
export { NETWORK };
