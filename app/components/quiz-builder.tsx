"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { emptyDraftQuestion, type DraftQuestion } from "@/lib/quiz-draft";
import { QUIZ_LIMITS, QUIZ_MAX_QUESTIONS, type QuizKind } from "@/lib/quiz";

const KINDS: { k: QuizKind; label: string }[] = [
  { k: "single", label: "One answer" },
  { k: "multiple", label: "Several answers" },
  { k: "text", label: "Typed answer" },
];

const inputCls =
  "h-10 w-full min-w-0 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3 text-[14px] outline-none placeholder:text-[var(--dim)] focus-visible:border-[var(--proof)]";

/**
 * Editor del cuestionario en /create. Las respuestas correctas viven solo en este estado:
 * se convierten en un hash local (lib/quiz-draft.ts) y nunca se envían.
 */
export function QuizBuilder({
  draft,
  onChange,
  errorIndex,
}: {
  draft: DraftQuestion[];
  onChange: (d: DraftQuestion[]) => void;
  errorIndex?: number;
}) {
  const set = (i: number, patch: Partial<DraftQuestion>) =>
    onChange(draft.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {draft.map((q, i) => (
        <fieldset
          key={q.id}
          className={`rounded-[12px] border bg-[var(--s1)] p-4 ${
            errorIndex === i ? "border-[var(--red)]" : "border-[var(--line)]"
          }`}
        >
          <legend className="sr-only">Question {i + 1}</legend>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[var(--dim)]">Q{i + 1}</span>
            <div className="ml-auto flex items-center gap-1 text-[var(--muted)]">
              <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </IconBtn>
              <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === draft.length - 1}>
                <ArrowDown className="size-4" />
              </IconBtn>
              <IconBtn
                label="Remove question"
                onClick={() => onChange(draft.filter((_, j) => j !== i))}
                disabled={draft.length === 1}
              >
                <Trash2 className="size-4" />
              </IconBtn>
            </div>
          </div>

          <input
            value={q.prompt}
            onChange={(e) => set(i, { prompt: e.target.value })}
            maxLength={QUIZ_LIMITS.prompt}
            placeholder="Your question"
            aria-label={`Question ${i + 1}`}
            className={`${inputCls} mt-3`}
          />
          {q.prompt.length > QUIZ_LIMITS.prompt * 0.8 && (
            <p className="mt-1 text-right font-mono text-[11px] text-[var(--dim)]">
              {q.prompt.length}/{QUIZ_LIMITS.prompt}
            </p>
          )}

          <div
            role="radiogroup"
            aria-label="Answer type"
            className="mt-3 inline-flex flex-wrap overflow-hidden rounded-[10px] border border-[var(--line)]"
          >
            {KINDS.map(({ k, label }, n) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={q.kind === k}
                onClick={() =>
                  set(i, {
                    kind: k,
                    correct: k === "single" ? q.correct.slice(0, 1) : q.correct,
                    choices: k === "text" ? q.choices : q.choices.length ? q.choices : ["", ""],
                  })
                }
                className={`px-3 py-1.5 font-mono text-[12px] ${
                  q.kind === k ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--muted)]"
                } ${n ? "border-l border-[var(--line)]" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {q.kind === "text" ? (
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[13px] text-[var(--muted)]">Correct answer</span>
              <input
                type="password"
                value={q.text}
                onChange={(e) => set(i, { text: e.target.value })}
                placeholder="Only you see this"
                autoComplete="off"
                className={`${inputCls} font-mono`}
              />
            </label>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <span className="text-[13px] text-[var(--muted)]">
                Options · tick the correct {q.kind === "single" ? "one" : "ones"}
              </span>
              {q.choices.map((c, k) => {
                const on = q.correct.includes(k);
                return (
                  <div key={k} className="flex items-center gap-2">
                    <input
                      type={q.kind === "single" ? "radio" : "checkbox"}
                      name={`correct-${q.id}`}
                      checked={on}
                      aria-label={`Option ${k + 1} is correct`}
                      onChange={() =>
                        set(i, {
                          correct:
                            q.kind === "single"
                              ? [k]
                              : on
                                ? q.correct.filter((x) => x !== k)
                                : [...q.correct, k],
                        })
                      }
                      className="size-4 shrink-0 accent-[var(--proof)]"
                    />
                    <input
                      value={c}
                      onChange={(e) =>
                        set(i, { choices: q.choices.map((x, m) => (m === k ? e.target.value : x)) })
                      }
                      maxLength={QUIZ_LIMITS.label}
                      placeholder={`Option ${k + 1}`}
                      aria-label={`Option ${k + 1}`}
                      className={inputCls}
                    />
                    <IconBtn
                      label={`Remove option ${k + 1}`}
                      disabled={q.choices.length <= 2}
                      onClick={() =>
                        set(i, {
                          choices: q.choices.filter((_, m) => m !== k),
                          correct: q.correct.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)),
                        })
                      }
                    >
                      <X className="size-4" />
                    </IconBtn>
                  </div>
                );
              })}
              {q.choices.length < 10 && (
                <button
                  type="button"
                  onClick={() => set(i, { choices: [...q.choices, ""] })}
                  className="self-start font-mono text-[12px] text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]"
                >
                  + Add option
                </button>
              )}
            </div>
          )}
        </fieldset>
      ))}

      {draft.length < QUIZ_MAX_QUESTIONS && (
        <button
          type="button"
          onClick={() => onChange([...draft, emptyDraftQuestion("single")])}
          className="btn-landing btn-landing-s btn-landing-sm inline-flex gap-2 self-start"
        >
          <Plus className="size-4" aria-hidden />
          Add question
        </button>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-[8px] hover:bg-[var(--s2)] hover:text-[var(--text)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
