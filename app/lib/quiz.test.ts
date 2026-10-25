import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "./answer";
import {
  QUIZ_MIN_BITS,
  parseQuiz,
  quizAnswersFromForm,
  quizFieldName,
  quizSearchBits,
  quizSecret,
  quizIsGuessable,
  type Quiz,
} from "./quiz";

const quiz: Quiz = {
  version: 1,
  questions: [
    {
      kind: "single",
      prompt: "Which network?",
      choices: [
        { value: "a", label: "Testnet" },
        { value: "b", label: "Mainnet" },
      ],
    },
    {
      kind: "multiple",
      prompt: "Pick the primes",
      choices: [
        { value: "a", label: "2" },
        { value: "b", label: "4" },
        { value: "c", label: "5" },
      ],
    },
    { kind: "text", prompt: "Capital of Portugal?" },
  ],
};

describe("quizSecret", () => {
  it("joins answers in question order behind a version tag", () => {
    const s = quizSecret(quiz, [{ choice: "a" }, { choices: ["c", "a"] }, { text: "Lisboa" }]);
    expect(s).toBe("quiz:v1\u001fc:a\u001fc:a,c\u001ft:lisboa");
  });

  it("normalizes freeform answers with the riddle normalizer", () => {
    const a = quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }, { text: "  LisbóA " }]);
    const b = quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }, { text: "lisboa" }]);
    expect(a).toBe(b);
  });

  it("sorts multiple-choice selections so click order does not matter", () => {
    const a = quizSecret(quiz, [{ choice: "b" }, { choices: ["c", "b", "a"] }, { text: "x" }]);
    const b = quizSecret(quiz, [{ choice: "b" }, { choices: ["a", "b", "c"] }, { text: "x" }]);
    expect(a).toBe(b);
  });

  it("depends on question order", () => {
    const swapped: Quiz = { ...quiz, questions: [quiz.questions[2], quiz.questions[1], quiz.questions[0]] };
    const a = quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }, { text: "a" }]);
    const b = quizSecret(swapped, [{ text: "a" }, { choices: ["a"] }, { choice: "a" }]);
    expect(a).not.toBe(b);
  });

  it("is already normalized, so the riddle pipeline leaves it unchanged", () => {
    const s = quizSecret(quiz, [{ choice: "a" }, { choices: ["c", "a"] }, { text: "Rio de Janeiro" }]);
    expect(normalizeAnswer(s)).toBe(s);
  });

  it("never collides with a plain riddle answer", () => {
    const s = quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }, { text: "a" }]);
    for (const plain of ["a", "c:a", "quiz:v1", "quiz:v1 c:a c:a t:a"]) {
      expect(normalizeAnswer(plain)).not.toBe(s);
    }
  });

  it("tells a typed answer apart from a choice with the same text", () => {
    const q: Quiz = {
      version: 1,
      questions: [
        { kind: "single", prompt: "Pick", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      ],
    };
    const t: Quiz = { version: 1, questions: [{ kind: "text", prompt: "Pick" }] };
    expect(quizSecret(q, [{ choice: "a" }])).not.toBe(quizSecret(t, [{ text: "a" }]));
  });

  it("ignores a typed answer on a choice question", () => {
    const q: Quiz = {
      version: 1,
      questions: [
        { kind: "single", prompt: "Pick", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      ],
    };
    expect(() => quizSecret(q, [{ text: "a" }])).toThrow();
  });

  it("creator and solver produce the same secret for the same answers", () => {
    const creator = [{ choice: "b" }, { choices: ["a", "c"] }, { text: "Lisboa" }];
    const solver = [{ choice: "b" }, { choices: ["c", "a"] }, { text: " lisboa" }];
    expect(quizSecret(quiz, creator)).toBe(quizSecret(quiz, solver));
  });

  it("rejects missing or invalid answers", () => {
    expect(() => quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }])).toThrow();
    expect(() => quizSecret(quiz, [{ choice: "z" }, { choices: ["a"] }, { text: "x" }])).toThrow();
    expect(() => quizSecret(quiz, [{ choice: "a" }, { choices: [] }, { text: "x" }])).toThrow();
    expect(() => quizSecret(quiz, [{ choice: "a" }, { choices: ["a"] }, { text: "  " }])).toThrow();
  });
});

describe("quizAnswersFromForm", () => {
  it("reads each question by its field name", () => {
    const fd = new FormData();
    fd.append(quizFieldName(0), "b");
    fd.append(quizFieldName(1), "c");
    fd.append(quizFieldName(1), "a");
    fd.append(quizFieldName(2), "Lisboa");
    const answers = quizAnswersFromForm(quiz, fd);
    expect(answers).toEqual([{ choice: "b" }, { choices: ["c", "a"] }, { text: "Lisboa" }]);
    expect(quizSecret(quiz, answers)).toBe("quiz:v1\u001fc:b\u001fc:a,c\u001ft:lisboa");
  });
});

describe("quizSearchBits / quizIsGuessable", () => {
  it("counts single choices as n options and multiple as 2^n - 1", () => {
    const q: Quiz = { version: 1, questions: [quiz.questions[0], quiz.questions[1]] };
    expect(quizSearchBits(q)).toBeCloseTo(Math.log2(2 * 7), 6);
  });

  it("treats a freeform question as not enumerable", () => {
    expect(quizSearchBits(quiz)).toBe(Infinity);
    expect(quizIsGuessable(quiz)).toBe(false);
  });

  it("flags a small choices-only quiz as guessable", () => {
    const q: Quiz = { version: 1, questions: [quiz.questions[0], quiz.questions[1]] };
    expect(quizIsGuessable(q)).toBe(true);
  });

  it("accepts a choices-only quiz once it reaches the minimum space", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ value: String.fromCharCode(97 + i), label: `${i}` }));
    const q: Quiz = {
      version: 1,
      // 5 × log2(2^10 − 1) ≈ 50 bits
      questions: Array.from({ length: 5 }, () => ({ kind: "multiple" as const, prompt: "p", choices: ten })),
    };
    expect(quizSearchBits(q)).toBeGreaterThanOrEqual(QUIZ_MIN_BITS);
    expect(quizIsGuessable(q)).toBe(false);
  });
});

describe("parseQuiz", () => {
  it("accepts a valid quiz and strips unknown fields", () => {
    const raw = JSON.parse(JSON.stringify({ ...quiz, correct: ["a"] }));
    const p = parseQuiz(raw);
    expect(typeof p).toBe("object");
    expect(p).not.toHaveProperty("correct");
  });

  it("rejects bad shapes", () => {
    expect(typeof parseQuiz(null)).toBe("string");
    expect(typeof parseQuiz({ version: 1, questions: [] })).toBe("string");
    expect(typeof parseQuiz({ version: 1, questions: [{ kind: "single", prompt: "p", choices: [{ value: "a", label: "A" }] }] })).toBe("string");
    expect(
      typeof parseQuiz({
        version: 1,
        questions: [{ kind: "single", prompt: "p", choices: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }],
      }),
    ).toBe("string");
    expect(
      typeof parseQuiz({
        version: 1,
        questions: [{ kind: "single", prompt: "p", choices: [{ value: "A B", label: "A" }, { value: "b", label: "B" }] }],
      }),
    ).toBe("string");
  });
});
