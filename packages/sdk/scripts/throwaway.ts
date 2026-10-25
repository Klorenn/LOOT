/** Creates one cheap long-lived testnet chest for scanners (OSINT / chaos). Answer is intentionally NOT printed. */
import { execFileSync } from "node:child_process";
import { createChest, keypairSigner } from "../src/index.js";

const secret = execFileSync("stellar", ["keys", "secret", "chestzk-e2e-creator"], { encoding: "utf8" }).trim();
const r = await createChest({
  question: "Throwaway scan target chest (testnet)",
  answer: "throwaway-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
  prizesXlm: ["0.1"],
  durationDays: 7,
  signer: keypairSigner(secret),
});
console.log(r.chestAddress, `https://stellar.expert/explorer/testnet/tx/${r.txHash}`);
process.exit(0);
