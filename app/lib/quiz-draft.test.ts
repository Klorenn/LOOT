import { describe, expect, it } from "vitest";
import { draftToQuiz, emptyDraftQuestion, type DraftQuestion } from "./quiz-draft";
import { quizSecret } from "./quiz";

const single: DraftQuestion = {
  ...emptyDraftQuestion("single"),
  prompt: "Which network?",
  choices: ["Testnet", "Mainnet"],
  correct: [1],
};
const multi: DraftQuestion = {
  ...emptyDraftQuestion("multiple"),
  prompt: "Pick the primes",
  choices: ["2", "4", "5"],
  correct: [2, 0],
};
const text: DraftQuestion = { ...emptyDraftQuestion("text"), prompt: "Capital of Portugal?", text: "Lisboa" };

describe("draftToQuiz", () => {
  it("builds the public quiz without the correct answers", () => {
    const r = draftToQuiz([single, multi, text]);
    if ("error" in r) throw new Error(r.error);
    expect(r.quiz.questions[0]).toEqual({
      kind: "single",
      prompt: "Which network?",
      choices: [
        { value: "a", label: "Testnet" },
        { value: "b", label: "Mainnet" },
      ],
    });
    expect(JSON.stringify(r.quiz)).not.toContain("Lisboa");
  });

  it("produces the secret a solver gets by picking the same answers", () => {
    const r = draftToQuiz([single, multi, text]);
    if ("error" in r) throw new Error(r.error);
    const solver = quizSecret(r.quiz, [{ choice: "b" }, { choices: ["c", "a"] }, { text: "lisboa" }]);
    expect(r.secret).toBe(solver);
  });

  it("drops blank choices and keeps the correct mark on the right one", () => {
    const q: DraftQuestion = { ...single, choices: ["Testnet", " ", "Mainnet"], correct: [2] };
    const r = draftToQuiz([q, text]);
    if ("error" in r) throw new Error(r.error);
    expect(r.quiz.questions[0].choices).toHaveLength(2);
    expect(r.secret).toContain("c:b");
  });

  it("reports which question is incomplete", () => {
    expect(draftToQuiz([])).toMatchObject({ error: expect.any(String) });
    expect(draftToQuiz([{ ...single, prompt: " " }])).toMatchObject({ index: 0 });
    expect(draftToQuiz([text, { ...single, correct: [] }])).toMatchObject({ index: 1 });
    expect(draftToQuiz([{ ...single, choices: ["only one"], correct: [0] }])).toMatchObject({ index: 0 });
    expect(draftToQuiz([{ ...text, text: "  " }])).toMatchObject({ index: 0 });
    expect(draftToQuiz([{ ...single, correct: [0, 1] }])).toMatchObject({ index: 0 });
  });
});
