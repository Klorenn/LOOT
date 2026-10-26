import { DEMO_CHEST } from "./config";

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

/** Metadatos locales del cofre demo (nombre, dificultad). El resto de los datos sale de la cadena. */
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
];

/** Catálogo del demo de TESTNET: en mainnet no hay demo (el id 6 de mainnet sería otro cofre). */
export function getChest(id: number, mainnet = false): ChestRow | undefined {
  return mainnet ? undefined : CHESTS.find((c) => c.id === id);
}

export function openChestsCount() {
  return CHESTS.filter((c) => c.status === "open").length;
}

