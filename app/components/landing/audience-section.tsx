import Link from "next/link";
import { BuildersIllustration } from "@/components/landing/builders-illustration";
import { CreatorsIllustration } from "@/components/landing/creators-illustration";
import { PlayersIllustration } from "@/components/landing/players-illustration";
import { chestPath } from "@/lib/chest-code";
import { DEMO_CHEST } from "@/lib/config";

type Card = {
  k: string;
  color: string;
  art: React.ReactNode;
  h: string;
  b: string;
  cta: string;
  href: string;
  external?: boolean;
};

/** "Who it is for": tres públicos, cada uno con su ilustración (Figma 46-235). */
export function AudienceSection({ docsUrl }: { docsUrl: string }) {
  const cards: Card[] = [
    {
      k: "Players",
      color: "var(--ok)",
      art: <PlayersIllustration />,
      h: "Bots can’t steal your win.",
      b: "Your answer never leaves your device, and a copied proof won't pay anyone else.",
      cta: "Open the demo chest →",
      href: chestPath(DEMO_CHEST.id),
    },
    {
      k: "Creators",
      color: "var(--gold)",
      art: <CreatorsIllustration />,
      h: "Lock a prize behind any riddle.",
      b: "Escrow XLM, set an expiry, share a link. Funds return if nobody solves it.",
      cta: "Create a chest →",
      href: "/create",
    },
    {
      k: "Builders",
      color: "var(--proof)",
      art: <BuildersIllustration />,
      h: "A pattern you can ship today.",
      b: "Address-bound proofs on Soroban. Open circuits, open contracts, MIT.",
      cta: "Read the docs →",
      href: docsUrl,
      external: true,
    },
  ];

  return (
    <section
      id="who"
      aria-labelledby="who-h"
      className="border-b border-[var(--line)] py-32"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <p
          data-fade
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
        >
          Who it is for
        </p>
        <h2
          id="who-h"
          data-reveal-h2
          className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Built for both sides of the riddle.
        </h2>
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <article
              key={c.k}
              data-fade
              className="audience-card flex flex-col rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-7"
            >
              <div className="flex h-[220px] items-center justify-center">{c.art}</div>
              <p
                className="mt-6 flex items-center gap-2 font-mono text-[12px]"
                style={{ color: c.color }}
              >
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: c.color }} />
                {c.k}
              </p>
              <h3 className="mt-4 text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">
                {c.h}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">{c.b}</p>
              {c.external ? (
                <a
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-landing mt-5 text-[15px] underline-offset-4 hover:underline"
                  style={{ color: c.color }}
                >
                  {c.cta}
                </a>
              ) : (
                <Link
                  href={c.href}
                  className="focus-landing mt-5 text-[15px] underline-offset-4 hover:underline"
                  style={{ color: c.color }}
                >
                  {c.cta}
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
