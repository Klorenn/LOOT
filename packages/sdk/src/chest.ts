import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  CONTRACTS,
  FEES,
  NETWORK,
  stroopsToXlm,
  xlmToStroops,
} from "./config.js";
import { type ChainOpts, type Signer, invoke, read, simulate } from "./chain.js";
import { normalizeAnswer } from "./normalize.js";
import {
  addressField,
  answerToField,
  fieldToHex,
  fingerprintAnswer,
  poseidon2,
  saltFromQuestion,
} from "./fingerprint.js";
import { type CircuitArtifacts, proveChest } from "./zk.js";
import { hash } from "@stellar/stellar-sdk";

export type SdkOpts = ChainOpts & {
  /** Override the factory address (default: CONTRACTS.factory). */
  factory?: string;
};

const factoryId = (o?: SdkOpts) => o?.factory ?? CONTRACTS.factory;

const addr = (a: string) => new Address(a).toScVal();
const bytes = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

export type FactoryConfig = {
  admin: string;
  treasury: string;
  chestWasmHash: string;
  verifier: string;
  token: string;
  creationFee: bigint;
  dailyFeeBps: number;
  maxDurationDays: number;
};

export async function getFactoryConfig(o?: SdkOpts): Promise<FactoryConfig> {
  const c = await read<Record<string, unknown>>(factoryId(o), "get_config", [], o);
  return {
    admin: c.admin as string,
    treasury: c.treasury as string,
    chestWasmHash: Buffer.from(c.chest_wasm_hash as Uint8Array).toString("hex"),
    verifier: c.verifier as string,
    token: c.token as string,
    creationFee: c.creation_fee as bigint,
    dailyFeeBps: Number(c.daily_fee_bps),
    maxDurationDays: Number(c.max_duration_days),
  };
}

// --------------------------------------------------------------------- quote

export type CreateQuote = {
  /** per-place amounts in claim order (1st, 2nd, ...) */
  places: { place: number; amountXlm: string }[];
  /** sum of all places, locked in the chest (fees never touch it) */
  prizeXlm: string;
  creationFeeXlm: string;
  /** EXACT prepaid reserve = prize x dailyFeeBps/10000 x days; the unused part is refunded on close */
  feeReserveXlm: string;
  /** network fee estimate from simulation (resource fee + inclusion), or a fallback */
  networkEstimateXlm: string;
  networkEstimateFromSimulation: boolean;
  /** prize + creation fee + fee reserve + network estimate */
  totalXlm: string;
  dailyFeeBps: number;
  durationDays: number;
};

/**
 * Prizes: give EITHER `prizesXlm` (one amount per place, in claim order: [50, 20, 10] =
 * 1st/2nd/3rd) OR `amountPerSlotXlm` + `slots` (equal prizes). Places are claim order: whoever
 * proves first gets the first amount.
 */
export type PrizeSpec = {
  prizesXlm?: (number | string)[];
  amountPerSlotXlm?: number | string;
  slots?: number;
};

export type CreateParams = PrizeSpec & {
  question: string;
  answer: string;
  durationDays: number;
};

export const MAX_PLACES = 50;

/** Resolve a PrizeSpec to stroop tiers; validates 1..50 places and every amount > 0. */
export function resolvePrizes(p: PrizeSpec): bigint[] {
  let tiers: bigint[];
  if (p.prizesXlm !== undefined) {
    if (p.amountPerSlotXlm !== undefined || p.slots !== undefined) {
      throw new Error("give either prizesXlm or amountPerSlotXlm + slots, not both");
    }
    tiers = p.prizesXlm.map((x) => xlmToStroops(x));
  } else {
    if (p.amountPerSlotXlm === undefined || p.slots === undefined) {
      throw new Error("give prizesXlm, or amountPerSlotXlm + slots");
    }
    if (!Number.isInteger(p.slots) || p.slots < 1) throw new Error("slots must be an integer >= 1");
    if (p.slots > MAX_PLACES) throw new Error(`at most ${MAX_PLACES} places`);
    tiers = Array.from({ length: p.slots }, () => xlmToStroops(p.amountPerSlotXlm as number | string));
  }
  if (tiers.length < 1 || tiers.length > MAX_PLACES) {
    throw new Error(`places must be between 1 and ${MAX_PLACES}`);
  }
  if (tiers.some((t) => t <= 0n)) throw new Error("every prize must be > 0");
  return tiers;
}

const FALLBACK_NETWORK_STROOPS = 5_000_000n; // 0.5 XLM

/**
 * Breakdown to show BEFORE signing. Pass `creator` (the G… that will pay) to get a
 * simulated network cost; without it a conservative fallback is used.
 */
export async function quoteCreate(
  p: Omit<CreateParams, "question" | "answer"> & { question?: string; answer?: string; creator?: string },
  o?: SdkOpts,
): Promise<CreateQuote> {
  const tiers = resolvePrizes(p);
  validateDays(p.durationDays);
  let cfg: Pick<FactoryConfig, "creationFee" | "dailyFeeBps">;
  try {
    cfg = await getFactoryConfig(o);
  } catch {
    cfg = { creationFee: xlmToStroops(FEES.creationFeeXlm), dailyFeeBps: FEES.dailyFeeBps };
  }
  const prize = tiers.reduce((a, b) => a + b, 0n);
  const reserve = (prize * BigInt(cfg.dailyFeeBps) * BigInt(p.durationDays)) / 10_000n;

  let network = FALLBACK_NETWORK_STROOPS;
  let fromSim = false;
  if (p.creator) {
    try {
      const question = p.question ?? "quote";
      const { fingerprintHex } = await fingerprintAnswer(p.answer ?? "x", saltFromQuestion(question));
      const { sim } = await simulate(
        factoryId(o),
        "create_chest",
        createArgs(p.creator, question, fingerprintHex, tiers, p.durationDays),
        { ...o, source: p.creator },
      );
      network = BigInt(sim.minResourceFee) + 100n;
      fromSim = true;
    } catch {
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

function validateDays(days: number) {
  if (!Number.isInteger(days) || days < 1 || days > FEES.maxDurationDays) {
    throw new Error(`durationDays must be an integer between 1 and ${FEES.maxDurationDays}`);
  }
}

function createArgs(
  creator: string,
  question: string,
  fingerprintHex: string,
  tiers: bigint[],
  days: number,
): xdr.ScVal[] {
  return [
    addr(creator),
    str(question),
    bytes(fingerprintHex),
    xdr.ScVal.scvVec(tiers.map((t) => i128(t))),
    u32(days),
  ];
}

// -------------------------------------------------------------------- create

export async function createChest(
  p: CreateParams & { signer: Signer } & SdkOpts,
): Promise<{ chestAddress: string; txHash: string; fingerprintHex: string }> {
  resolvePrizes(p);
  validateDays(p.durationDays);
  if (!p.question.trim()) throw new Error("question is required");
  if (!normalizeAnswer(p.answer)) throw new Error("answer is required");
  const { fingerprintHex } = await fingerprintAnswer(p.answer, saltFromQuestion(p.question));
  return createChestFromFingerprint({ ...p, fingerprintHex });
}

/**
 * Same as createChest but with a precomputed fingerprint (hex), so the answer never
 * leaves the browser when a server signs/submits the transaction.
 */
export async function createChestFromFingerprint(
  p: Omit<CreateParams, "answer"> & { fingerprintHex: string; signer: Signer } & SdkOpts,
): Promise<{ chestAddress: string; txHash: string; fingerprintHex: string }> {
  const tiers = resolvePrizes(p);
  validateDays(p.durationDays);
  if (!p.question.trim()) throw new Error("question is required");
  const r = await invoke(
    factoryId(p),
    "create_chest",
    createArgs(p.signer.publicKey, p.question, p.fingerprintHex, tiers, p.durationDays),
    p.signer,
    p,
  );
  return { chestAddress: String(r.returnValue), txHash: r.hash, fingerprintHex: p.fingerprintHex };
}

// ---------------------------------------------------------------------- read

export type Chest = {
  address: string;
  creator: string;
  question: string;
  fingerprintHex: string;
  token: string;
  treasury: string;
  verifier: string;
  /** prize schedule in claim order (stroops) and the same in XLM */
  prizes: bigint[];
  prizesXlm: string[];
  /** number of places */
  slots: number;
  /** claims so far (== next place, 0-based) */
  claims: number;
  slotsLeft: number;
  /** next place to be paid ("Next prize: 2nd place, 20 XLM"), null when sold out or closed */
  nextPlace: { place: number; amountXlm: string; amount: bigint } | null;
  expiry: Date;
  lastFeeTs: number;
  dailyFeeBps: number;
  closed: boolean;
  expired: boolean;
  /** live token balance of the chest (stroops) */
  balance: bigint;
  balanceXlm: string;
  /** unclaimed prize (stroops); fees never touch it */
  prizePool: bigint;
  /** prepaid fees not yet charged (stroops); unused part is refunded on close */
  feeReserve: bigint;
};

export async function getChest(address: string, o?: ChainOpts): Promise<Chest> {
  const [i, balance] = await Promise.all([
    read<Record<string, unknown>>(address, "get_info", [], o),
    read<bigint>(address, "balance", [], o),
  ]);
  const expiry = new Date(Number(i.expiry as bigint) * 1000);
  const prizes = (i.prizes as bigint[]).map((x) => BigInt(x));
  const slots = Number(i.slots);
  const claims = Number(i.claims);
  const closed = Boolean(i.closed);
  return {
    address,
    creator: i.creator as string,
    question: i.question as string,
    fingerprintHex: Buffer.from(i.fingerprint as Uint8Array).toString("hex"),
    token: i.token as string,
    treasury: i.treasury as string,
    verifier: i.verifier as string,
    prizes,
    prizesXlm: prizes.map(stroopsToXlm),
    slots,
    claims,
    slotsLeft: closed ? 0 : slots - claims,
    nextPlace:
      closed || claims >= slots
        ? null
        : { place: claims + 1, amountXlm: stroopsToXlm(prizes[claims]), amount: prizes[claims] },
    expiry,
    lastFeeTs: Number(i.last_fee_ts as bigint),
    dailyFeeBps: Number(i.daily_fee_bps),
    closed,
    expired: Date.now() > expiry.getTime(),
    balance,
    balanceXlm: stroopsToXlm(balance),
    prizePool: i.prize_pool as bigint,
    feeReserve: i.fee_reserve as bigint,
  };
}

/** All chest contract addresses created by the factory (oldest first). */
export async function listChests(o?: SdkOpts): Promise<string[]> {
  const total = Number(await read<number>(factoryId(o), "chest_count", [], o));
  const out: string[] = [];
  const page = 50;
  for (let start = 0; start < total; start += page) {
    const part = await read<string[]>(factoryId(o), "list_chests", [u32(start), u32(page)], o);
    out.push(...part);
  }
  return out;
}

// --------------------------------------------------------------------- claim

export type ClaimParams = {
  chestAddress: string;
  answer: string;
  /** G… or C… that receives the prize (bound into the proof). */
  recipient: string;
  /** Pays the tx fee. For gasless/passkey flows give a relayer-backed signer with `submit`. */
  signer: Signer;
  /**
   * Secret behind the nullifier (nullifier = Poseidon(playerSecret, chestId)).
   * Default: a fresh random secret, returned by `claim` so the caller can store it.
   * NOTE: the circuit does not bind playerSecret to the recipient, so this does NOT
   * limit claims per person: anyone who knows the answer can claim several slots with
   * different secrets. The nullifier only stops replaying the same proof.
   */
  playerSecret?: bigint;
  /** Legacy chests only: override the salt (default derives from the question). */
  salt?: bigint;
  circuit?: CircuitArtifacts;
} & SdkOpts;

/** Random 248-bit secret (fits the BN254 field). Keep it if you need to prove the same nullifier again. */
export function randomPlayerSecret(): bigint {
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
export async function claim(
  p: ClaimParams,
): Promise<{ txHash: string; nullifierHex: string; playerSecret: bigint }> {
  const chest = await getChest(p.chestAddress, p);
  const salt = p.salt ?? saltFromQuestion(chest.question);
  const answerField = answerToField(normalizeAnswer(p.answer));
  const fp = fieldToHex(await poseidon2(answerField, salt));
  if (fp !== chest.fingerprintHex) throw new WrongAnswerError();

  const playerSecret = p.playerSecret ?? randomPlayerSecret();
  const proved = await proveChest(
    {
      answer: answerField,
      salt,
      playerSecret,
      chestId: BigInt(addressField(p.chestAddress).decimal),
      recipient: BigInt(addressField(p.recipient).decimal),
    },
    p.circuit,
  );
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
export async function submitClaim(
  p: {
    chestAddress: string;
    recipient: string;
    nullifierHex: string;
    proof: { a: string; b: string; c: string };
    signer: Signer;
  } & ChainOpts,
): Promise<{ txHash: string }> {
  const proofScVal = xdr.ScVal.scvMap(
    (["a", "b", "c"] as const).map(
      (k) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(k),
          val: xdr.ScVal.scvBytes(Buffer.from(p.proof[k].replace(/^0x/, ""), "hex")),
        }),
    ),
  );
  const r = await invoke(
    p.chestAddress,
    "claim",
    [addr(p.recipient), bytes(p.nullifierHex.replace(/^0x/, "")), proofScVal],
    p.signer,
    { ...p, cpuInstructions: 100_000_000 },
  );
  return { txHash: r.hash };
}

// --------------------------------------------------------------------- close

/** Creator only. Charges due fees and refunds the remaining balance to the creator. */
export async function close(
  p: { chestAddress: string; signer: Signer } & ChainOpts,
): Promise<{ txHash: string; refundedStroops: bigint; refundedXlm: string }> {
  const r = await invoke(p.chestAddress, "close", [], p.signer, p);
  const refunded = BigInt(r.returnValue as bigint);
  return { txHash: r.hash, refundedStroops: refunded, refundedXlm: stroopsToXlm(refunded) };
}

/** Public: charge the daily fees already due (anyone can call). */
export async function accrueFees(
  p: { chestAddress: string; signer: Signer } & ChainOpts,
): Promise<{ txHash: string; feeStroops: bigint }> {
  const r = await invoke(p.chestAddress, "accrue_fees", [], p.signer, p);
  return { txHash: r.hash, feeStroops: BigInt(r.returnValue as bigint) };
}

export { NETWORK };
