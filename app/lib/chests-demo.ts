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
    name: "Bits of a byte",
    type: "Riddle · Poseidon",
    difficulty: 1,
    status: "open",
    expires: "—",
    attempts: 0,
    reward: `${DEMO_CHEST.prize} CHEST`,
    rewardAmount: DEMO_CHEST.prize,
    question: DEMO_CHEST.question,
    hint: DEMO_CHEST.hint,
    salt: DEMO_CHEST.salt,
    fingerprint: DEMO_CHEST.fingerprintHex,
    live: true,
  },
  {
    id: 421,
    name: "Harbor of the ancient library",
    type: "Riddle · Poseidon",
    difficulty: 3,
    status: "open",
    expires: "3d 14h",
    attempts: 18,
    reward: "1,250 XLM",
    rewardAmount: 1250,
    question: "What harbor holds the scrolls of the lost library?",
    live: false,
  },
  {
    id: 318,
    name: "Ledger of seven seals",
    type: "Crypto · Poseidon",
    difficulty: 4,
    status: "open",
    expires: "1d 2h",
    attempts: 41,
    reward: "500 XLM",
    rewardAmount: 500,
    question: "Name the seventh seal.",
    live: false,
  },
  {
    id: 210,
    name: "Stellar meridian",
    type: "Trivia",
    difficulty: 2,
    status: "claimed",
    expires: "—",
    attempts: 9,
    reward: "100 XLM",
    rewardAmount: 100,
    question: "Where does Meridian meet the chain?",
    live: false,
  },
  {
    id: 156,
    name: "Nullifier garden",
    type: "Riddle",
    difficulty: 2,
    status: "expired",
    expires: "expired",
    attempts: 3,
    reward: "50 XLM",
    rewardAmount: 50,
    question: "What blooms once and never again?",
    live: false,
  },
  {
    id: 99,
    name: "Draft: lighthouse cipher",
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
