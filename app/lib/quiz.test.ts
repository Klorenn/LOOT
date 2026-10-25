import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "./answer";
import {
  QUIZ_LIMITS,
  QUIZ_MIN_BITS,
  cleanTypedAnswer,
  parseQuiz,
  quizAnswersFromForm,
  quizChoiceBits,
  quizFieldName,
  quizSecret,
  quizIsGuessable,
  quizServerGuessable,
  quizStrengthBits,
  typedAnswerBits,
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

const ten = Array.from({ length: 10 }, (_, i) => ({ value: String.fromCharCode(97 + i), label: `${i}` }));
const yesNo: Quiz["questions"][number] = {
  kind: "single",
  prompt: "Is Stellar fast?",
  choices: [
    { value: "a", label: "Yes" },
    { value: "b", label: "No" },
  ],
};
const year: Quiz["questions"][number] = { kind: "text", prompt: "What year did Stellar launch?" };

describe("brute-force guard", () => {
  it("uses 48 bits as the minimum", () => {
    expect(QUIZ_MIN_BITS).toBe(48);
  });

  it("counts single choices as n options and multiple as 2^n - 1; text adds 0", () => {
    expect(quizChoiceBits({ version: 1, questions: [quiz.questions[0], quiz.questions[1]] })).toBeCloseTo(
      Math.log2(2 * 7),
      6,
    );
    expect(quizChoiceBits(quiz)).toBeCloseTo(Math.log2(2 * 7), 6);
  });

  it("estimates a typed answer by its normalized length and character set", () => {
    expect(typedAnswerBits("yes")).toBeLessThan(10);
    expect(typedAnswerBits("2014")).toBeCloseTo(4 * Math.log2(10), 6);
    expect(typedAnswerBits("  ")).toBe(0);
    expect(typedAnswerBits("where we first met in buenos aires")).toBeGreaterThanOrEqual(QUIZ_MIN_BITS);
  });

  it("does not let any typed question bypass the guard", () => {
    const q: Quiz = { version: 1, questions: [yesNo, year] };
    const answers = [{ choice: "a" }, { text: "2014" }];
    expect(quizStrengthBits(q, answers)).toBeCloseTo(1 + 4 * Math.log2(10), 6);
    expect(quizIsGuessable(q, answers)).toBe(true);
  });

  it("accepts a quiz whose typed answer is strong enough", () => {
    const q: Quiz = { version: 1, questions: [yesNo, year] };
    expect(quizIsGuessable(q, [{ choice: "a" }, { text: "where we first met in buenos aires" }])).toBe(false);
  });

  it("accepts a choices-only quiz once it reaches the minimum space", () => {
    // 5 × log2(2^10 − 1) ≈ 50 bits
    const q: Quiz = {
      version: 1,
      questions: Array.from({ length: 5 }, () => ({ kind: "multiple" as const, prompt: "p", choices: ten })),
    };
    expect(quizIsGuessable(q, [])).toBe(false);
  });

  it("server rule: rejects a small choices-only quiz, cannot judge typed answers", () => {
    expect(quizServerGuessable({ version: 1, questions: [yesNo] })).toBe(true);
    expect(quizServerGuessable({ version: 1, questions: [yesNo, year] })).toBe(false);
    const big: Quiz = {
      version: 1,
      questions: Array.from({ length: 5 }, () => ({ kind: "multiple" as const, prompt: "p", choices: ten })),
    };
    expect(quizServerGuessable(big)).toBe(false);
  });
});

describe("typed answer sanitizing", () => {
  const twoText: Quiz = { version: 1, questions: [year, { kind: "text", prompt: "Second?" }] };

  it("strips control and zero-width characters", () => {
    expect(cleanTypedAnswer("li​s‌b‍o⁠a﻿")).toBe("lisboa");
    expect(cleanTypedAnswer("a\u0000b\u001fc\u007fd")).toBe("abcd");
  });

  it("zero-width characters do not change the secret", () => {
    const plain = quizSecret(twoText, [{ text: "lisboa" }, { text: "porto" }]);
    expect(quizSecret(twoText, [{ text: "lis​boa" }, { text: "﻿porto" }])).toBe(plain);
  });

  it("a separator inside an answer cannot forge another answer set", () => {
    const s1 = quizSecret(twoText, [{ text: "a\u001ft:b" }, { text: "c" }]);
    const s2 = quizSecret(twoText, [{ text: "a" }, { text: "b\u001ft:c" }]);
    expect(s1).not.toBe(s2);
    // un separador por pregunta, ninguno extra dentro de las respuestas
    expect(s1.split("\u001f")).toHaveLength(3);
    expect(s2.split("\u001f")).toHaveLength(3);
  });

  it("an answer that is only invisible marks counts as empty", () => {
    expect(() => quizSecret({ version: 1, questions: [year] }, [{ text: "́​" }])).toThrow();
  });
});

describe("length limits", () => {
  it("exports the limits the server enforces", () => {
    expect(QUIZ_LIMITS).toEqual({ prompt: 300, description: 300, label: 120, title: 500 });
  });

  it("parseQuiz uses the same limits", () => {
    const mk = (prompt: string, label: string) => ({
      version: 1,
      questions: [{ kind: "single", prompt, choices: [{ value: "a", label }, { value: "b", label: "B" }] }],
    });
    expect(typeof parseQuiz(mk("p".repeat(QUIZ_LIMITS.prompt), "l".repeat(QUIZ_LIMITS.label)))).toBe("object");
    expect(typeof parseQuiz(mk("p".repeat(QUIZ_LIMITS.prompt + 1), "L"))).toBe("string");
    expect(typeof parseQuiz(mk("p", "l".repeat(QUIZ_LIMITS.label + 1)))).toBe("string");
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
