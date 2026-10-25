import Link from "next/link";

type Tone = "red" | "proof" | "gold" | "dim" | "ok";

const BORDER: Record<Tone, string> = {
  red: "var(--red)",
  proof: "var(--proof)",
  gold: "var(--gold)",
  dim: "var(--dim)",
  ok: "var(--ok)",
};

export function InlineAlert({
  tone,
  title,
  body,
  actions,
}: {
  tone: Tone;
  title: string;
  body: string;
  actions?: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <div
      className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-5"
      style={{ borderLeftWidth: 3, borderLeftColor: BORDER[tone] }}
      role="alert"
    >
      <p
        className="font-mono text-[12px] tracking-[0.08em] uppercase"
        style={{ color: BORDER[tone] }}
      >
        {title}
      </p>
      <p className="mt-2 text-[15px] leading-[1.5] text-[var(--muted)]">{body}</p>
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className={
                a.primary
                  ? "btn-landing btn-landing-p btn-landing-sm"
                  : "btn-landing btn-landing-s btn-landing-sm"
              }
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
