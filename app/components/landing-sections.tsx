"use client";

import Link from "next/link";
import { LogoChest, type ChestTint } from "@/components/logo-chest";

type Stats = { paid: number; rejected: number; settle: number };

export function HeroStats({ stats }: { stats: Stats }) {
  return (
    <div
      data-hero-fade
      className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--line)] pt-6"
    >
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em]">
          <span data-count={stats.paid}>{stats.paid}</span>{" "}
          <span className="text-[14px] text-[var(--gold)]">USDC</span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">
          paid to solvers
        </div>
      </div>
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em] text-[var(--red)]">
          <span data-count={stats.rejected}>{stats.rejected}</span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">
          bot copies rejected
        </div>
      </div>
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em]">
          <span
            data-count={stats.settle}
            data-prefix="~"
            data-suffix=" s"
          >
            ~{stats.settle} s
          </span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">to settle</div>
      </div>
    </div>
  );
}

const AUDIENCE: {
  label: string;
  tint: ChestTint;
  color: string;
  h: string;
  b: string;
  href: string;
  cta: string;
}[] = [
  {
    label: "Players",
    tint: "ok",
    color: "var(--ok)",
    h: "Bots can’t steal your win.",
    b: "Solve, prove, get paid. Anyone watching your transaction can copy the proof, but it only pays your address.",
    href: "/chest/2",
    cta: "Browse open chests →",
  },
  {
    label: "Creators",
    tint: "gold",
    color: "var(--gold)",
    h: "Lock a prize behind any riddle.",
    b: "Escrow tokens, set an expiry, share a link. Funds return if nobody solves it.",
    href: "/create",
    cta: "Create a chest →",
  },
  {
    label: "Builders",
    tint: "proof",
    color: "var(--proof)",
    h: "A pattern you can ship today.",
    b: "Address-bound proofs on Soroban. Open circuits, open contracts, MIT.",
    href: "https://github.com/Klorenn/ChestZK",
    cta: "Read the docs →",
  },
];

export function WhoSection() {
  return (
    <section
      id="who"
      aria-labelledby="who-h"
      className="border-b border-[var(--line)] py-32"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <p
          data-fade
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--proof)]"
        >
          WHO IT IS FOR
        </p>
        <h2
          id="who-h"
          data-reveal-h2
          className="mt-4 max-w-[18ch] text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Built for both sides of the riddle.
        </h2>
        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {AUDIENCE.map((a) => (
            <article
              key={a.label}
              data-fade
              className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-7"
            >
              <LogoChest className="mx-auto w-[120px]" tint={a.tint} />
              <p
                className="mt-6 flex items-center gap-2 font-mono text-[12px] tracking-[0.06em]"
                style={{ color: a.color }}
              >
                <span
                  className="inline-block size-[6px] rounded-full"
                  style={{ background: a.color }}
                  aria-hidden
                />
                {a.label}
              </p>
              <h3 className="mt-3 text-[22px] leading-[1.2] font-semibold tracking-[-0.02em]">
                {a.h}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                {a.b}
              </p>
              <Link
                href={a.href}
                className="focus-landing mt-5 inline-block text-[14px] font-medium"
                style={{ color: a.color }}
              >
                {a.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepSolve() {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--dim)]">
          ANSWER
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ok)]">
          <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
          local
        </span>
      </div>
      <div className="mt-2 rounded-[8px] border border-[var(--proof)] px-3 py-2 text-[15px] font-medium text-[var(--text)] shadow-[0_0_0_1px_rgba(138,140,255,.25)]">
        piano
      </div>
      <code className="mt-3 block font-mono text-[11px] text-[var(--muted)]">
        hash → 0x5c1e…a77f
      </code>
    </div>
  );
}

function StepSeal() {
  return (
    <pre className="overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-4 font-mono text-[11px] leading-[1.7] text-[var(--muted)]">
      {`prove(answer, {
  commitment: 0x5c1e…
  nullifier:  0x3f9e…
  prover: `}
      <span className="text-[var(--proof)]">GA7Q…X4ZK</span>
      {`
}) → π 192 bytes`}
    </pre>
  );
}

function StepClaim() {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-4 font-mono text-[12px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[var(--text)]">
          <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
          Proof verified
        </span>
        <span className="text-[var(--dim)]">212 ms</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
        <span className="text-[var(--muted)]">Prize sent</span>
        <span className="font-medium text-[var(--gold)]">+1 USDC</span>
      </div>
    </div>
  );
}

function StepSpent() {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-4 font-mono text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[var(--text)]">
          <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
          nullifier 0x3f9e… spent
        </span>
        <span className="shrink-0 text-[var(--dim)]">ledger 51,204</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
        <span className="text-[var(--muted)]">Replay 0x3f9e…</span>
        <span className="font-semibold text-[var(--red)]">REVERTED</span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    t: "Solve locally",
    b: "Crack the riddle in your browser. Only a hash of the answer exists.",
    Visual: StepSolve,
  },
  {
    n: "02",
    t: "Seal it to you",
    b: "A ZK proof binds the answer to your Stellar address as a public input.",
    Visual: StepSeal,
  },
  {
    n: "03",
    t: "Claim the prize",
    b: "Soroban checks the proof against the recipient sealed inside it, then pays out.",
    Visual: StepClaim,
  },
  {
    n: "04",
    t: "Spent once, forever",
    b: "Every claim burns a nullifier. Replaying the same proof hits a spent nullifier and reverts.",
    Visual: StepSpent,
  },
];

export function HowSection() {
  return (
    <section
      id="how"
      aria-labelledby="how-h"
      className="border-b border-[var(--line)] py-32"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <p
          data-fade
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--proof)]"
        >
          HOW IT WORKS
        </p>
        <h2
          id="how-h"
          data-reveal-h2
          className="mt-4 max-w-[16ch] text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Four steps. One rightful owner.
        </h2>
        <p
          data-fade
          className="mt-5 max-w-[40rem] text-[18px] leading-[1.55] text-[var(--muted)]"
        >
          The answer never leaves your device. The proof carries your address.
          The contract only pays the address inside the proof.
        </p>
        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STEPS.map(({ n, t, b, Visual }) => (
            <article
              key={n}
              data-fade
              className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6"
            >
              <Visual />
              <div className="mt-5 font-mono text-[12px] text-[var(--dim)]">
                {n}
              </div>
              <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                {t}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                {b}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AttackSection() {
  return (
    <section
      id="attack"
      data-attack
      aria-labelledby="attack-h"
      className="landing-panel-grid relative flex min-h-screen items-center border-b border-[var(--line)] py-24"
    >
      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <p
            data-fade
            className="font-mono text-[12px] tracking-[0.08em] text-[var(--red)]"
          >
            ATTACK DEMO
          </p>
          <h2
            id="attack-h"
            data-reveal-h2
            className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
          >
            Copy the proof. Lose the race anyway.
          </h2>
          <p
            data-fade
            className="mt-5 text-[18px] leading-[1.55] text-[var(--muted)]"
          >
            With a plain-text answer, anyone who sees your transaction (relayer,
            validators, explorers) or the ledger after the first claim can copy
            it and claim too. On ChestZK a copied proof only pays the address
            sealed inside it.
          </p>
          <ul data-fade className="mt-8 space-y-3">
            {[
              {
                bar: "var(--red)",
                t: "Bot copies π from your transaction and resends it.",
              },
              {
                bar: "var(--line)",
                t: "Contract checks the recipient against the proof’s public input.",
              },
              {
                bar: "var(--ok)",
                t: "Only GA7Q…X4ZK can claim. The bot pays gas for nothing.",
              },
            ].map((row) => (
              <li key={row.t} className="flex gap-3 text-[15px] text-[var(--muted)]">
                <span
                  className="mt-1.5 h-8 w-[3px] shrink-0 rounded-sm"
                  style={{ background: row.bar }}
                  aria-hidden
                />
                <span className="leading-[1.5]">{row.t}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/attack"
            data-fade
            className="btn-landing btn-landing-s mt-8 inline-flex"
          >
            Run the demo
          </Link>
        </div>

        <div
          data-term
          role="region"
          aria-label="Attack replay log"
          className="overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--s1)] shadow-[0_24px_80px_rgba(0,0,0,.45)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="flex gap-1.5" aria-hidden>
              <span className="size-[10px] rounded-full bg-[#FF5F57]" />
              <span className="size-[10px] rounded-full bg-[#FEBC2E]" />
              <span className="size-[10px] rounded-full bg-[#28C840]" />
            </div>
            <span className="flex items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
              <span className="size-[6px] rounded-full bg-[var(--red)]" />
              Attack demo · Illustrative
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-[2] text-[var(--muted)] md:p-6 md:text-[13px]">
            <span data-term-line className="block">
              $ chestzk attack --replay case-0421
            </span>
            <span data-term-line className="block">
              $ watch ledger --chest 0421
            </span>
            <span data-term-line className="block">
              00.00 <span className="text-[var(--proof)]">you</span> submit{" "}
              <span className="text-[var(--text)]">π</span> sealed to{" "}
              <span className="text-[var(--text)]">GA7Q…X4ZK</span>
            </span>
            <span data-term-line className="block">
              00.41 <span className="text-[var(--red)]">bot</span> copy{" "}
              <span className="text-[var(--text)]">π</span> from your tx, resend
              to GBOT…7Q1
            </span>
            <span data-term-line className="block">
              00.80 chain verify(π, recipient=GBOT…7Q1)
            </span>
            <span
              data-term-line="rejected"
              className="mt-1 mb-1 block rounded-[8px] border border-[rgba(255,90,90,.35)] bg-[rgba(255,90,90,.1)] px-3 py-2 text-[var(--red)]"
            >
              REJECTED recipient ≠ proof · bound to GA7Q…X4ZK
            </span>
            <span data-term-line className="block">
              01.20 chain verify(π, recipient=GA7Q…X4ZK)
            </span>
            <span
              data-term-line
              className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(75,227,160,.35)] bg-[rgba(75,227,160,.1)] px-3 py-2 text-[var(--ok)]"
            >
              <span>VERIFIED prize released to GA7Q…X4ZK</span>
              <span className="text-[var(--gold)]">1 USDC</span>
            </span>
            <span data-term-line className="mt-2 block">
              $ <span className="cursor-blink">▌</span>
            </span>
          </pre>
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section
      aria-labelledby="cta-h"
      className="border-b border-[var(--line)] py-24"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="landing-panel-grid relative overflow-hidden rounded-[20px] border border-[var(--line)] px-6 py-20 text-center md:px-12 md:py-24">
          <div className="relative z-10">
            <LogoChest className="mx-auto w-[100px]" tint="proof" />
            <h2
              id="cta-h"
              data-reveal-h2
              className="mt-8 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
            >
              The next chest is waiting.
            </h2>
            <p
              data-fade
              className="mx-auto mt-5 max-w-[28rem] text-[18px] leading-[1.55] text-[var(--muted)]"
            >
              Bring a wallet and a sharp mind. We bring the bots that will fail.
            </p>
            <div
              data-fade
              className="mt-10 flex flex-wrap justify-center gap-3"
            >
              <Link
                href="/enter?next=/chest/2"
                className="btn-landing btn-landing-p"
              >
                Open a chest →
              </Link>
              <Link href="/create" className="btn-landing btn-landing-s">
                Create a chest
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
