import { estimateAnswerBits } from "./answer-entropy";
import { QUIZ_MIN_BITS, typedAnswerKey } from "./quiz";

/**
 * Strength check for typed answers on /create (single chests and sets). Quizzes keep their own combined rule
 * in lib/quiz.ts (choice questions count their combinations; typed parts use the same estimate).
 * Fingerprints are NOT changed by any of this: it only gates and explains what the creator types.
 * CLIENT-SIDE ONLY: the answer never leaves the device, so no server enforces this (direct API/contract use can skip it).
 */
export const ANSWER_MIN_BITS = QUIZ_MIN_BITS; // 48: same floor quizzes already enforce
export const ANSWER_GOOD_BITS = 64;

export type AnswerStrength = { bits: number; level: "empty" | "weak" | "fair" | "strong" };

export function answerStrength(text: string): AnswerStrength {
  const bits = estimateAnswerBits(typedAnswerKey(text));
  if (bits === 0) return { bits, level: "empty" };
  if (bits < ANSWER_MIN_BITS) return { bits, level: "weak" };
  if (bits < ANSWER_GOOD_BITS) return { bits, level: "fair" };
  return { bits, level: "strong" };
}

/** Plain explanation shown next to every typed answer. */
export const GUESSING_WARNING =
  "The fingerprint of your answer is public on-chain. Anyone can download it and try guesses on their own computer, as fast as they like, and nobody can stop them. Short or common answers get found. Whoever finds the answer can claim the prize.";

export const WEAK_ANSWER_ADVICE = "Use a longer answer: a full phrase of 5 or more words that only your players would know. Avoid names, dates, single words and anything easy to look up.";

/**
 * Message when the answer is too weak, else null. `enforce` = block (mainnet); otherwise the same text is shown
 * as a warning only (testnet keeps short answers for demos and templates).
 */
export function weakAnswerMessage(text: string): string | null {
  return answerStrength(text).level === "weak" ? `Too easy to guess. ${WEAK_ANSWER_ADVICE}` : null;
}

/** Blocking error: only when enforcing and the answer is weak. Empty answers are reported elsewhere. */
export function answerBlockError(text: string, enforce: boolean): string | null {
  return enforce ? weakAnswerMessage(text) : null;
}
