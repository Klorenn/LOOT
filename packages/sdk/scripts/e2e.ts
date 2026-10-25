/**
 * End-to-end on testnet through the SDK, podium chest:
 *   1) 3-tier chest [0.5, 0.3, 0.2] XLM: three claims from three different recipients,
 *      each must receive EXACTLY its tier (a separate fee payer pays the network fee)
 *   2) second chest: one claim, then close -> refund = unpaid tiers + unused reserve
 *   npx tsx scripts/e2e.ts
 * Uses stellar-cli identities chestzk-e2e-creator / -player / -player2 / -player3
 * (secrets are read from the CLI keystore and never printed).
 */
import { execFileSync } from "node:child_process";
import {
  CONTRACTS,
  claim,
  close,
  createChest,
  getChest,
  keypairSigner,
  listChests,
  quoteCreate,
  xlmToStroops,
} from "../src/index.js";
import { read } from "../src/chain.js";
import { Address } from "@stellar/stellar-sdk";

const secret = (name: string) =>
  execFileSync("stellar", ["keys", "secret", name], { encoding: "utf8" }).trim();
const addrOf = (name: string) =>
  execFileSync("stellar", ["keys", "address", name], { encoding: "utf8" }).trim();
const creator = keypairSigner(secret("chestzk-e2e-creator"));
const recipients = ["chestzk-e2e-player", "chestzk-e2e-player2", "chestzk-e2e-player3"].map(addrOf);
const ex = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const xlmBal = (a: string) =>
  read<bigint>(CONTRACTS.xlm, "balance", [new Address(a).toScVal()]);

const params = {
  question: "What is the capital of Portugal?",
  answer: "  Lisboa ",
  prizesXlm: ["0.5", "0.3", "0.2"],
  durationDays: 3,
};
const tiers = params.prizesXlm.map((x) => xlmToStroops(x));

console.log("quote:", await quoteCreate({ ...params, creator: creator.publicKey }));

// ---------------------------------------------------------------- chest A: three places
const a = await createChest({ ...params, signer: creator });
console.log("A create:", a.chestAddress, ex(a.txHash));
let c = await getChest(a.chestAddress);
console.log("  schedule", c.prizesXlm, "next", c.nextPlace, "balance", c.balanceXlm);
console.log("  listChests includes A:", (await listChests()).includes(a.chestAddress));

for (let i = 0; i < 3; i++) {
  const before = await xlmBal(recipients[i]);
  const r = await claim({
    chestAddress: a.chestAddress,
    answer: "lisboa",
    recipient: recipients[i],
    signer: creator, // fee payer, so the recipient delta is exactly the tier
  });
  const delta = (await xlmBal(recipients[i])) - before;
  console.log(`A claim place ${i + 1}: +${Number(delta) / 1e7} XLM (expected ${Number(tiers[i]) / 1e7})`, delta === tiers[i] ? "OK" : "MISMATCH", ex(r.txHash));
  if (delta !== tiers[i]) throw new Error("tier mismatch");
  c = await getChest(a.chestAddress);
  console.log("  next:", c.nextPlace, "pool", c.prizePool);
}
const closedA = await close({ chestAddress: a.chestAddress, signer: creator });
console.log("A close (sold out): refunded", closedA.refundedXlm, "XLM (leftover reserve)", ex(closedA.txHash));

// ---------------------------------------------------------------- chest B: refund after one claim
const b = await createChest({ ...params, signer: creator });
console.log("B create:", b.chestAddress, ex(b.txHash));
const rb = await claim({
  chestAddress: b.chestAddress,
  answer: "lisboa",
  recipient: recipients[0],
  signer: creator,
});
console.log("B claim place 1:", ex(rb.txHash));
const cb = await getChest(b.chestAddress);
const closedB = await close({ chestAddress: b.chestAddress, signer: creator });
console.log(
  "B close: refunded",
  closedB.refundedXlm,
  "XLM = unpaid tiers (0.3+0.2) + reserve",
  cb.feeReserve,
  "stroops",
  ex(closedB.txHash),
);
if (closedB.refundedStroops !== tiers[1] + tiers[2] + cb.feeReserve) throw new Error("refund mismatch");
console.log("B refund matches unpaid tiers + reserve: OK");
process.exit(0);
