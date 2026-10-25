import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "await",
  "async",
  "return",
  "export",
]);

/** One alternation, left to right: comment | string | bigint literal | word. */
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
    if (comment) color = "var(--dim)";
    else if (str) color = "var(--ok)";
    else if (big) color = "var(--gold)";
    else if (word && KEYWORDS.has(word)) color = "var(--proof)";
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

/**
 * Code panel: title bar (dots, file name, language tab, right label) and a
 * horizontally scrollable body. Keywords proof, strings ok, bigint gold, comments dim.
 */
export function CodeBlock({
  code,
  file,
  lang = "TypeScript",
  label,
}: {
  code: string;
  file: string;
  lang?: string;
  label?: string;
}) {
  const lines = code.split("\n");
  return (
    <figure className="min-w-0 overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--s1)]">
      <figcaption className="flex h-11 items-center gap-3 border-b border-[var(--line)] px-4">
        <span className="flex gap-[6px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-[9px] rounded-full bg-[var(--line)]"
            />
          ))}
        </span>
        <span className="font-mono text-[12px] text-[var(--muted)]">{file}</span>
        <span className="border-b border-[var(--proof)] font-mono text-[11px] leading-[26px] text-[var(--text)]">
          {lang}
        </span>
        {label && (
          <span className="ml-auto hidden font-mono text-[11px] text-[var(--dim)] sm:inline">
            {label}
          </span>
        )}
      </figcaption>
      <pre
        tabIndex={0}
        className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[22px] text-[var(--text)]"
      >
        <code>
          {lines.map((l, i) => (
            <span key={i} className="block min-h-[22px] whitespace-pre">
              {highlight(l)}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
