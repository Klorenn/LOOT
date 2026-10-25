export type ChestTemplate = {
  id: "airdrop" | "evento" | "bounty" | "curso";
  name: string;
  blurb: string;
  question: string;
  hint: string;
  answer: string;
  prize: number;
  maxClaims: number;
};

export const TEMPLATES: ChestTemplate[] = [
  {
    id: "airdrop",
    name: "Airdrop",
    blurb: "Solo cobra quien sabe, no el bot.",
    question: "¿Cuál es el ticker del dólar en Stellar?",
    hint: "Tres letras, estable",
    answer: "USDC",
    prize: 50,
    maxClaims: 100,
  },
  {
    id: "evento",
    name: "Evento",
    blurb: "Cofre en el venue: escaneá y respondé.",
    question: "¿En qué ciudad es Meridian 2026?",
    hint: "Capital de Portugal",
    answer: "Lisboa",
    prize: 100,
    maxClaims: 50,
  },
  {
    id: "bounty",
    name: "Bounty / CTF",
    blurb: "Flag onchain sin filtrar la solución.",
    question: "¿Cuántos bits tiene un byte?",
    hint: "Potencia de dos, entre 4 y 16",
    answer: "8",
    prize: 100,
    maxClaims: 5,
  },
  {
    id: "curso",
    name: "Curso",
    blurb: "Recompensa por aprender, no por copiar.",
    question: "¿Qué prueba Stellar nativo en Protocol 25/26?",
    hint: "Curva BN…",
    answer: "BN254",
    prize: 25,
    maxClaims: 200,
  },
];
