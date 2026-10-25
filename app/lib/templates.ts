export type ChestTemplate = {
  id: "airdrop" | "evento" | "bounty" | "curso";
  name: string;
  blurb: string;
  question: string;
  hint: string;
  /** Solo orientación para quien crea; NO se pre-llena: el creador escribe su propia respuesta. */
  answerPlaceholder: string;
  prize: number;
  maxClaims: number;
};

/**
 * Las preguntas se pueden verificar en developers.stellar.org:
 *  airdrop → /docs/learn/fundamentals
 *  evento  → /docs/build/smart-contracts/overview
 *  bounty  → /docs/learn/fundamentals/stellar-consensus-protocol
 *  curso   → /docs/build/apps/zk
 * Las respuestas no se guardan acá: un template sin tocar no debe crear un cofre trivial.
 */
export const TEMPLATES: ChestTemplate[] = [
  {
    id: "airdrop",
    name: "Airdrop",
    blurb: "Only those who know can claim, not bots.",
    question: "What is the ticker of Stellar's native asset?",
    hint: "Three letters",
    answerPlaceholder: "3-letter ticker",
    prize: 1,
    maxClaims: 100,
  },
  {
    id: "evento",
    name: "Evento",
    blurb: "A chest at the venue: scan and answer.",
    question: "What is the name of Stellar's smart contract platform?",
    hint: "Starts with S",
    answerPlaceholder: "One word: the platform's name",
    prize: 1,
    maxClaims: 50,
  },
  {
    id: "bounty",
    name: "Bounty / CTF",
    blurb: "An on-chain flag that doesn't leak the solution.",
    question: "What is the acronym of Stellar's consensus protocol?",
    hint: "Three letters",
    answerPlaceholder: "A 3-letter acronym",
    prize: 1,
    maxClaims: 5,
  },
  {
    id: "curso",
    name: "Curso",
    blurb: "A reward for learning, not for copying.",
    question: "Which elliptic curve did Protocol 25 add for ZK proofs?",
    hint: "A BN… curve",
    answerPlaceholder: "Name of an elliptic curve",
    prize: 1,
    maxClaims: 200,
  },
];
