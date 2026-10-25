import { DEMO_CHEST, CONTRACTS } from "./config";

export type ChestRow = {
  id: number;
  name: string;
  type: string;
  difficulty: 1 | 2 | 3 | 4;
  status: "open" | "claimed" | "expired" | "draft";
  expires: string;
  attempts: number;
  reward: string;
  rewardAmount: number;
  question: string;
  hint?: string;
  salt?: string;
  fingerprint?: string;
  live: boolean;
};

/** Demo catalogue — only id=2 is live on testnet. Others tagged example. */
export const CHESTS: ChestRow[] = [
  {
    id: DEMO_CHEST.id,
    name: "Who created SCP",
    type: "Riddle · Poseidon",
    difficulty: 3,
    status: "open",
    expires: "—",
    attempts: 0,
    reward: DEMO_CHEST.prizeLabel,
    rewardAmount: DEMO_CHEST.prize,
    question: DEMO_CHEST.question,
    hint: DEMO_CHEST.hint,
    salt: DEMO_CHEST.salt,
    fingerprint: DEMO_CHEST.fingerprintHex,
    live: true,
  },
  {
    id: 421,
    name: "Consensus protocol",
    type: "Riddle · Poseidon",
    difficulty: 3,
    status: "open",
    expires: "3d 14h",
    attempts: 18,
    reward: "1,250 XLM",
    rewardAmount: 1250,
    question: "What is the name of the Stellar consensus protocol?",
    live: false,
  },
  {
    id: 318,
    name: "Contract platform",
    type: "Crypto · Poseidon",
    difficulty: 4,
    status: "open",
    expires: "1d 2h",
    attempts: 41,
    reward: "500 XLM",
    rewardAmount: 500,
    question: "What is the name of Stellar's smart contract platform?",
    live: false,
  },
  {
    id: 210,
    name: "Native asset",
    type: "Trivia",
    difficulty: 2,
    status: "claimed",
    expires: "—",
    attempts: 9,
    reward: "100 XLM",
    rewardAmount: 100,
    question: "What is the ticker of the native Stellar asset?",
    live: false,
  },
  {
    id: 156,
    name: "ZK curve",
    type: "Riddle",
    difficulty: 2,
    status: "expired",
    expires: "expired",
    attempts: 3,
    reward: "50 XLM",
    rewardAmount: 50,
    question: "Which elliptic curve got host functions in Protocol 25?",
    live: false,
  },
  {
    id: 99,
    name: "Draft: Stellar quiz",
    type: "Draft",
    difficulty: 2,
    status: "draft",
    expires: "—",
    attempts: 0,
    reward: "200 XLM",
    rewardAmount: 200,
    question: "WIP",
    live: false,
  },
];

export function getChest(id: number): ChestRow | undefined {
  return CHESTS.find((c) => c.id === id);
}

export function openChestsCount() {
  return CHESTS.filter((c) => c.status === "open").length;
}

export { CONTRACTS };
