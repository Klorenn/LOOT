import Link from "next/link";
import { LogoChest } from "@/components/logo-chest";

type Tone = "red" | "proof" | "gold" | "dim" | "ok";

const COLOR: Record<Tone, string> = {
  red: "var(--red)",
  proof: "var(--proof)",
  gold: "var(--gold)",
  dim: "var(--dim)",
  ok: "var(--ok)",
};

export type StateAction = {
  label: string;
  primary?: boolean;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/**
 * Loot StateBlock: 200px visual + text column (mono uppercase label with coloured dot,
 * H2 40px, lead 16px, 1–2 buttons). `visual` overrides the chest; use `chest="none"` for no visual.
 */
export function StateBlock({
  tone,
  label,
  title,
  body,
  chest = "closed",
  visual,
  actions,
}: {
  tone: Tone;
  label: string;
  title: React.ReactNode;
  body: React.ReactNode;
  chest?: "closed" | "open" | "none";
  visual?: React.ReactNode;
  actions?: StateAction[];
}) {
  const color = COLOR[tone];
  const cls = (a: StateAction) =>
    a.primary ? "btn-landing btn-landing-p" : "btn-landing btn-landing-s";
  return (
    <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center">
      {(visual || chest !== "none") && (
        <div className="flex w-[200px] shrink-0 justify-center">
          {visual ?? (
            <LogoChest
              className="w-[150px]"
              deg={chest === "open" ? 28 : 0}
              showInside={chest === "open"}
            />
          )}
        </div>
      )}
      <div>
        <p
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase"
          style={{ color }}
        >
          <span
            className="size-[6px] rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          {label}
        </p>
        <h2 className="mt-3 text-[clamp(28px,4vw,40px)] leading-[1.05] font-semibold tracking-[-0.03em]">
          {title}
        </h2>
        <div className="mt-3 max-w-[36rem] text-[16px] leading-[1.55] text-[var(--muted)]">
          {body}
        </div>
        {actions && actions.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {actions.map((a) =>
              a.href !== undefined ? (
                <Link key={a.label} href={a.href} className={cls(a)}>
                  {a.label}
                </Link>
              ) : (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={cls(a)}
                >
                  {a.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
