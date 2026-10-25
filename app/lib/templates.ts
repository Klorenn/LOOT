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
    blurb: "Solo cobra quien sabe, no el bot.",
    question: "¿Cuál es el ticker del activo nativo de Stellar?",
    hint: "Tres letras",
    answerPlaceholder: "Ticker de 3 letras",
    prize: 1,
    maxClaims: 100,
  },
  {
    id: "evento",
    name: "Evento",
    blurb: "Cofre en el venue: escaneá y respondé.",
    question: "¿Cómo se llama la plataforma de contratos inteligentes de Stellar?",
    hint: "Empieza con S",
    answerPlaceholder: "Una palabra, el nombre de la plataforma",
    prize: 1,
    maxClaims: 50,
  },
  {
    id: "bounty",
    name: "Bounty / CTF",
    blurb: "Flag onchain sin filtrar la solución.",
    question: "¿Qué siglas tiene el protocolo de consenso de Stellar?",
    hint: "Tres letras",
    answerPlaceholder: "Una sigla de 3 letras",
    prize: 1,
    maxClaims: 5,
  },
  {
    id: "curso",
    name: "Curso",
    blurb: "Recompensa por aprender, no por copiar.",
    question: "¿Qué curva elíptica incorporó Protocol 25 para pruebas ZK?",
    hint: "Curva BN…",
    answerPlaceholder: "Nombre de una curva elíptica",
    prize: 1,
    maxClaims: 200,
  },
];
