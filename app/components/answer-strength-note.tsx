import { GUESSING_WARNING, WEAK_ANSWER_ADVICE, answerStrength } from "@/lib/answer-strength";

/**
 * Explains, next to a typed answer, why a short or common answer can be guessed offline from the public
 * on-chain fingerprint. `enforced` = the creator cannot continue with a weak answer (mainnet).
 */
export function AnswerStrengthNote({ text, enforced }: { text: string; enforced: boolean }) {
  const s = answerStrength(text);
  if (s.level === "empty") return <p className="text-[12px] leading-[1.5] text-[var(--dim)]">{GUESSING_WARNING}</p>;
  if (s.level === "weak")
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--gold)]" role="alert">
        Too easy to guess.{" "}
        {enforced ? "You can’t create this chest with this answer. " : "You can still create it on testnet, but on mainnet this would be blocked. "}
        {GUESSING_WARNING} {WEAK_ANSWER_ADVICE}
      </p>
    );
  if (s.level === "fair")
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--muted)]">
        Fair, not strong. Longer is safer. {GUESSING_WARNING}
      </p>
    );
  return <p className="text-[12px] leading-[1.5] text-[var(--ok)]">Hard to guess. The fingerprint is still public, so keep the answer private.</p>;
}
