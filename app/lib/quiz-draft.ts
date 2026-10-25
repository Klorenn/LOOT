import {
  QUIZ_LIMITS,
  quizSecret,
  typedAnswerKey,
  type Quiz,
  type QuizAnswer,
  type QuizKind,
  type QuizQuestion,
} from "./quiz";

/**
 * Borrador del cuestionario en /create: lo que edita el creador, CON las respuestas correctas.
 * draftToQuiz separa la parte pública (va a los metadatos) del secreto (solo se hashea aquí).
 */
export type DraftQuestion = {
  id: string;
  kind: QuizKind;
  prompt: string;
  /** etiquetas de las opciones (single/multiple) */
  choices: string[];
  /** índices de `choices` que son correctos */
  correct: number[];
  /** respuesta correcta de una pregunta de texto */
  text: string;
};

export function emptyDraftQuestion(kind: QuizKind = "single"): DraftQuestion {
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    prompt: "",
    choices: kind === "text" ? [] : ["", ""],
    correct: [],
    text: "",
  };
}

export type DraftResult =
  | { quiz: Quiz; answers: QuizAnswer[]; secret: string }
  | { error: string; index?: number };

const VALUES = "abcdefghij";

export function draftToQuiz(draft: DraftQuestion[]): DraftResult {
  if (!draft.length) return { error: "Add at least one question." };
  const questions: QuizQuestion[] = [];
  const answers: QuizAnswer[] = [];
  for (const [i, d] of draft.entries()) {
    const n = i + 1;
    if (!d.prompt.trim()) return { error: `Question ${n} needs a question.`, index: i };
    if (d.prompt.trim().length > QUIZ_LIMITS.prompt)
      return { error: `Question ${n} is too long (max ${QUIZ_LIMITS.prompt} characters).`, index: i };
    if (d.kind === "text") {
      if (!typedAnswerKey(d.text)) return { error: `Question ${n} needs the correct answer.`, index: i };
      questions.push({ kind: "text", prompt: d.prompt.trim() });
      answers.push({ text: d.text });
      continue;
    }
    // las opciones vacías se descartan; los índices correctos se reubican
    const kept = d.choices
      .map((label, idx) => ({ label: label.trim(), idx }))
      .filter((c) => c.label);
    if (kept.length < 2) return { error: `Question ${n} needs at least 2 options.`, index: i };
    if (kept.length > VALUES.length) return { error: `Question ${n} has too many options (max 10).`, index: i };
    if (kept.some((c) => c.label.length > QUIZ_LIMITS.label))
      return { error: `An option in question ${n} is too long (max ${QUIZ_LIMITS.label} characters).`, index: i };
    const choices = kept.map((c, k) => ({ value: VALUES[k], label: c.label }));
    const correct = kept.flatMap((c, k) => (d.correct.includes(c.idx) ? [VALUES[k]] : []));
    if (!correct.length) return { error: `Mark the correct option in question ${n}.`, index: i };
    if (d.kind === "single" && correct.length > 1)
      return { error: `Question ${n} allows only one correct option.`, index: i };
    questions.push({ kind: d.kind, prompt: d.prompt.trim(), choices });
    answers.push(d.kind === "single" ? { choice: correct[0] } : { choices: correct });
  }
  const quiz: Quiz = { version: 1, questions };
  // se usa dentro de useMemo: nunca debe lanzar
  try {
    return { quiz, answers, secret: quizSecret(quiz, answers) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check your answers." };
  }
}
