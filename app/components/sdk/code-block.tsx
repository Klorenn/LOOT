import type { ReactNode } from "react";
import { CopyIcon } from "@/components/sdk/copy-icon";

const KEYWORDS = new Set(["import", "from", "const", "await", "async", "return", "export"]);

/** One alternation, left to right: comment | string | bigint | word. */
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d[\d_]*n\b)|([A-Za-z_$][\w$]*)/g;

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    const [text, comment, str, big, word] = m;
    let color: string | null = null;
    if (comment) color = "#6F6A7A";
    else if (str) color = "#4BE3A0";
    else if (big) color = "#F7C948";
    else if (word && KEYWORDS.has(word)) color = "#8A8CFF";
    else if (word && /^[A-Z][A-Z0-9_]{2,}$/.test(word)) color = "#F7C948"; // constants
    out.push(
      color ? (
        <span key={key++} style={{ color }}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    last = at + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Terminal line: dim prompt, bright command. */
function terminal(line: string): ReactNode {
  if (!line.startsWith("$ ")) return line;
  return (
    <>
      <span className="text-[var(--dim)]">$ </span>
      <span className="text-[var(--ok)]">{line.slice(2)}</span>
    </>
  );
}

/**
 * Code panel: 46px tab header (active tab 2px proof underline, language label + copy icon at the
 * right) and a horizontally scrollable body with an optional 52px line-number gutter.
 */
export function CodeBlock({
  code,
  file,
  lang = "TypeScript",
  copy,
  numbers = true,
  shell = false,
  size = "md",
  bg = "var(--s1)",
}: {
  code: string;
  file: string;
  lang?: string;
  /** Exact text copied; defaults to `code`. */
  copy?: string;
  numbers?: boolean;
  shell?: boolean;
  size?: "md" | "sm";
  bg?: string;
}) {
  const lines = code.split("\n");
  const text = size === "md" ? "text-[14px] leading-[24px]" : "text-[13px] leading-[22px]";
  const rowH = size === "md" ? "min-h-[24px]" : "min-h-[22px]";
  return (
    <figure
      className="min-w-0 overflow-hidden rounded-[12px] border border-[var(--line)]"
      style={{ background: bg }}
    >
      <figcaption className="flex h-[46px] items-stretch justify-between border-b border-[var(--line)] bg-[#111017] pr-2">
        <span className="relative flex items-center px-5 font-mono text-[12px] text-[var(--text)]">
          {file}
          <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#8A8CFF]" aria-hidden />
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--dim)]">{lang}</span>
          <CopyIcon value={copy ?? code} label={`Copy ${file}`} />
        </span>
      </figcaption>
      <pre
        tabIndex={0}
        className={`overflow-x-auto py-4 pr-5 font-mono text-[var(--text)] ${text} ${
          numbers ? "" : "pl-5"
        }`}
      >
        <code className="block w-max min-w-full">
          {lines.map((l, i) => (
            <span key={i} className={`flex whitespace-pre ${rowH}`}>
              {numbers && (
                <span
                  aria-hidden
                  className="w-[52px] shrink-0 pr-4 text-right text-[#44414F] select-none"
                >
                  {i + 1}
                </span>
              )}
              <span className={numbers ? "pl-1" : ""}>{shell || l.startsWith("$ ") ? terminal(l) : highlight(l)}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
