"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Wraps a secret text input (masked by default) with an eye button to reveal / hide it.
 * The caller renders the input with the `type` we hand back and adds `SECRET_INPUT_PAD` so the text
 * never runs under the button. The button is `type="button"` so it can't submit a form.
 */
export const SECRET_INPUT_PAD = "pr-11";

export function SecretField({ children }: { children: (type: "password" | "text") => ReactNode }) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <div className="relative">
      {children(shown ? "text" : "password")}
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide answer" : "Show answer"}
        className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--proof)]"
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
