import { describe, expect, it } from "vitest";
import { estimateAnswerBits } from "./answer-entropy";
import { ANSWER_MIN_BITS, answerBlockError, answerStrength, weakAnswerMessage } from "./answer-strength";
import { answerToField, normalizeAnswer } from "./answer";

describe("estimateAnswerBits", () => {
  it("treats common words and passwords as tiny", () => {
    for (const w of ["yes", "password", "Bitcoin", "Buenos Aires"]) expect(estimateAnswerBits(normalizeAnswer(w))).toBe(8);
  });
  it("treats runs as tiny", () => {
    for (const w of ["abcdef", "123456", "qwerty", "987654"]) expect(estimateAnswerBits(w)).toBeLessThanOrEqual(10);
  });
  it("caps low-variety strings", () => {
    expect(estimateAnswerBits("aaaaaaaaaaaa")).toBeLessThan(15);
    expect(estimateAnswerBits("abababababab")).toBeLessThan(20);
  });
  it("keeps the previous per-character numbers for ordinary answers", () => {
    expect(estimateAnswerBits("2014")).toBeCloseTo(4 * Math.log2(10), 6);
    expect(estimateAnswerBits("lisbonne")).toBeCloseTo(8 * 2.3, 6);
    expect(estimateAnswerBits("a1b2c3d4")).toBeCloseTo(32, 6);
  });
});

describe("answerStrength", () => {
  it("grades by the 48/64-bit thresholds", () => {
    expect(answerStrength("").level).toBe("empty");
    expect(answerStrength("lisboa").level).toBe("weak");
    expect(answerStrength("where we first met in town").level).toBe("fair");
    expect(answerStrength("the third door on the left past the old bakery in town").level).toBe("strong");
  });
  it("is robust to case, accents and spacing like the fingerprint is", () => {
    expect(answerStrength("  PÁSSWORD ").bits).toBe(answerStrength("password").bits);
  });
});

describe("answerBlockError", () => {
  it("blocks weak answers only when enforcing", () => {
    expect(answerBlockError("yes", true)).toMatch(/Too easy to guess/);
    expect(answerBlockError("yes", false)).toBeNull();
  });
  it("never blocks a strong answer", () => {
    expect(answerBlockError("the third door on the left past the old bakery in town", true)).toBeNull();
  });
  it("warning text does not claim a guarantee", () => {
    expect(weakAnswerMessage("yes") ?? "").not.toMatch(/guarantee|audited/i);
  });
});

describe("fingerprints are untouched", () => {
  it("answerToField still maps the same input to the same field element", () => {
    expect(answerToField("42")).toBe(BigInt(42));
    expect(answerToField("lisboa")).toBe(answerToField("lisboa"));
  });
});

it("floor matches the quiz floor", () => expect(ANSWER_MIN_BITS).toBe(48));
