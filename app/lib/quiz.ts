import { normalizeAnswer } from "./answer";
import { estimateAnswerBits } from "./answer-entropy";

/**
 * Cofre cuestionario (todo o nada). La parte pública (preguntas y opciones) va en los metadatos;
 * las respuestas correctas NUNCA. Todas las respuestas se combinan en UN secreto canónico que
 * entra al mismo camino que un acertijo simple: normalizeAnswer → answerToField → Poseidon.
 * No cambia el circuito ni el contrato.
 *
 * Formato del secreto: "quiz:v1" + US + parte_1 + US + … + parte_n   (US = \u001f)
 *   - opción única:    "c:<value>"
 *   - opción múltiple: "c:<values ordenados, separados por coma>"
 *   - texto libre:     "t:<normalizeAnswer(texto sin controles ni invisibles)>"
 * El prefijo con versión evita choques con un acertijo simple; "c:"/"t:" separan una opción
 * de un texto escrito igual.
 */

export type QuizKind = "single" | "multiple" | "text";
export type QuizChoice = { value: string; label: string };
export type QuizQuestion = {
  kind: QuizKind;
  prompt: string;
  description?: string;
  /** single/multiple: 2..10 opciones */
  choices?: QuizChoice[];
};
export type Quiz = { version: 1; questions: QuizQuestion[] };

/** Respuesta a una pregunta: una opción, varias opciones o texto. */
export type QuizAnswer = { choice?: string; choices?: string[]; text?: string };

export const QUIZ_VERSION_TAG = "quiz:v1";
const SEP = "\u001f";
export const QUIZ_MAX_QUESTIONS = 20;
const MAX_CHOICES = 10;
const VALUE_RE = /^[a-z0-9]{1,8}$/;
/**
 * Mínimo de intentos (en bits) para publicar un cuestionario: 2^48 ≈ 2.8e14. Cada intento es
 * SHA-256 + Poseidon; a ~1e8 intentos/s en GPU son semanas, no horas (2^40 caía en un día).
 */
export const QUIZ_MIN_BITS = 48;
/** Límites que valida el servidor. La UI de /create usa los mismos. */
export const QUIZ_LIMITS = { prompt: 300, description: 300, label: 120, title: 500 } as const;

/** Controles (U+0000–U+001F, U+007F) e invisibles de ancho cero: se quitan de las respuestas escritas. */
const INVISIBLE_RE = /[\u0000-\u001f\u007f​-‍⁠﻿]/g;

/** Limpia una respuesta escrita. Mismo paso al crear y al resolver. */
export function cleanTypedAnswer(text: string): string {
  return text.replace(INVISIBLE_RE, "");
}

/** Respuesta escrita lista para el secreto ("" si no queda nada visible). */
export function typedAnswerKey(text: string): string {
  return normalizeAnswer(cleanTypedAnswer(text));
}

function choiceValues(q: QuizQuestion): Set<string> {
  return new Set((q.choices ?? []).map((c) => c.value));
}

function part(q: QuizQuestion, a: QuizAnswer | undefined, i: number): string {
  const fail = (why: string) => {
    throw new Error(`Question ${i + 1}: ${why}`);
  };
  if (!a) fail("missing answer");
  if (q.kind === "text") {
    const text = typeof a!.text === "string" ? typedAnswerKey(a!.text) : "";
    if (!text) fail("empty answer");
    return `t:${text}`;
  }
  const valid = choiceValues(q);
  if (q.kind === "single") {
    if (a!.choice === undefined) fail("no choice selected");
    if (!valid.has(a!.choice!)) fail("unknown choice");
    return `c:${a!.choice}`;
  }
  const picked = [...new Set(a!.choices ?? [])];
  if (!picked.length) fail("no choice selected");
  if (picked.some((v) => !valid.has(v))) fail("unknown choice");
  return `c:${picked.sort().join(",")}`;
}

/** Secreto canónico del cuestionario. Lo usan igual el creador y quien lo resuelve. */
export function quizSecret(quiz: Quiz, answers: QuizAnswer[]): string {
  if (answers.length !== quiz.questions.length) throw new Error("Answer every question");
  return [QUIZ_VERSION_TAG, ...quiz.questions.map((q, i) => part(q, answers[i], i))].join(SEP);
}

/** Nombre del campo de formulario de la pregunta i (el cuestionario es un <form>). */
export const quizFieldName = (i: number) => `q${i}`;

/** Lee las respuestas de un FormData del cuestionario, en el orden de las preguntas. */
export function quizAnswersFromForm(quiz: Quiz, form: FormData): QuizAnswer[] {
  return quiz.questions.map((q, i) => {
    const name = quizFieldName(i);
    const vals = form.getAll(name).filter((v): v is string => typeof v === "string");
    if (q.kind === "multiple") return { choices: vals };
    if (q.kind === "single") return { choice: vals[0] };
    return { text: vals[0] ?? "" };
  });
}

/** log2 de las combinaciones de las preguntas de opciones (las de texto suman 0). */
export function quizChoiceBits(quiz: Quiz): number {
  let bits = 0;
  for (const q of quiz.questions) {
    if (q.kind === "text") continue;
    const n = q.choices?.length ?? 0;
    bits += q.kind === "multiple" ? Math.log2(2 ** n - 1) : Math.log2(n);
  }
  return bits;
}

/**
 * Estimación conservadora de bits de una respuesta escrita, sobre el texto normalizado:
 * solo dígitos log2(10)/carácter; solo letras ~2.3/carácter (texto en lenguaje natural, no
 * letras al azar); mezcla u otros símbolos 4/carácter. Es una cota gruesa, no una garantía.
 */
export function typedAnswerBits(text: string): number {
  return estimateAnswerBits(typedAnswerKey(text)); // reglas en lib/answer-entropy.ts
}

/** Bits totales: opciones + respuestas escritas (necesita las respuestas: solo en /create). */
export function quizStrengthBits(quiz: Quiz, answers: QuizAnswer[]): number {
  let bits = quizChoiceBits(quiz);
  quiz.questions.forEach((q, i) => {
    if (q.kind === "text") bits += typedAnswerBits(answers[i]?.text ?? "");
  });
  return bits;
}

/** true = el hash público se puede romper probando combinaciones offline. */
export function quizIsGuessable(quiz: Quiz, answers: QuizAnswer[]): boolean {
  return quizStrengthBits(quiz, answers) < QUIZ_MIN_BITS;
}

/**
 * Regla del servidor: no ve las respuestas, así que solo puede rechazar un cuestionario de
 * opciones con pocas combinaciones. Si hay preguntas de texto, la fuerza depende de respuestas
 * que nunca recibe (lo controla /create).
 */
export function quizServerGuessable(quiz: Quiz): boolean {
  return !quiz.questions.some((q) => q.kind === "text") && quizChoiceBits(quiz) < QUIZ_MIN_BITS;
}

const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Valida la parte pública que guarda el servidor. Devuelve un string de error si no sirve. */
export function parseQuiz(raw: unknown): Quiz | string {
  if (!raw || typeof raw !== "object") return "bad quiz";
  const r = raw as { version?: unknown; questions?: unknown };
  if (r.version !== 1) return "bad quiz version";
  if (!Array.isArray(r.questions) || r.questions.length < 1 || r.questions.length > QUIZ_MAX_QUESTIONS)
    return "bad quiz questions";
  const questions: QuizQuestion[] = [];
  for (const [i, x] of r.questions.entries()) {
    const q = x as Record<string, unknown>;
    const at = `quiz question ${i + 1}`;
    if (!q || typeof q !== "object") return `bad ${at}`;
    if (q.kind !== "single" && q.kind !== "multiple" && q.kind !== "text") return `bad ${at} kind`;
    if (!str(q.prompt, QUIZ_LIMITS.prompt)) return `bad ${at} prompt`;
    if (q.description !== undefined && q.description !== "" && !str(q.description, QUIZ_LIMITS.description))
      return `bad ${at} description`;
    const out: QuizQuestion = { kind: q.kind, prompt: q.prompt.trim() };
    if (typeof q.description === "string" && q.description.trim()) out.description = q.description.trim();
    if (q.kind !== "text") {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > MAX_CHOICES)
        return `bad ${at} choices`;
      const seen = new Set<string>();
      out.choices = [];
      for (const c of q.choices as Record<string, unknown>[]) {
        if (!c || typeof c.value !== "string" || !VALUE_RE.test(c.value) || seen.has(c.value))
          return `bad ${at} choice value`;
        if (!str(c.label, QUIZ_LIMITS.label)) return `bad ${at} choice label`;
        seen.add(c.value);
        out.choices.push({ value: c.value, label: c.label.trim() });
      }
    }
    questions.push(out);
  }
  return { version: 1, questions };
}
