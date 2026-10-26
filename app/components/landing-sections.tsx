"use client";

import Link from "next/link";
import {
  Flag,
  Megaphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ExampleTag } from "@/components/example-tag";
import { LogoChest } from "@/components/logo-chest";
import { DEMO_CHEST, PRIZE } from "@/lib/config";
import { useNet } from "@/components/network-provider";
import { switchNetwork } from "@/lib/network";

/** Valores reales de /api/stats (eventos on-chain); "—" mientras carga o si el RPC falla. */
export type Stats = { paid: string; claims: string; created: string };

export function HeroStats({ stats }: { stats: Stats }) {
  return (
    <div
      data-hero-fade
      className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--line)] pt-6"
    >
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em]">
          <span>{stats.paid}</span>{" "}
          <span className="text-[14px] text-[var(--gold)]">{PRIZE.code}</span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">
          paid to solvers · last 7 days
        </div>
      </div>
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em] text-[var(--ok)]">
          <span>{stats.claims}</span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">
          verified claims · last 7 days
        </div>
      </div>
      <div>
        <b className="font-mono text-[22px] font-medium tracking-[-0.03em]">
          <span>{stats.created}</span>
        </b>
        <div className="mt-0.5 text-[12px] text-[var(--dim)]">
          chests created · last 7 days
        </div>
      </div>
    </div>
  );
}

const fp = DEMO_CHEST.fingerprintHex;
const FP_SHORT = `0x${fp.slice(0, 4)}…${fp.slice(-4)}`;

/** Detalle mono de cada paso: solo datos reales (config / cadena) o texto sin números. */
const STEPS: { n: string; t: string; b: string; detail: React.ReactNode }[] = [
  {
    n: "01",
    t: "Solve a riddle",
    b: "Every chest locks a prize behind a question.",
    detail: <span className="text-[var(--muted)]">hash → {FP_SHORT}</span>,
  },
  {
    n: "02",
    t: "Your answer is checked, and stays secret",
    b: "A zero-knowledge proof shows you know it without revealing it.",
    detail: <span className="text-[var(--proof)]">proof → verified</span>,
  },
  {
    n: "03",
    t: "Claim your prize",
    b: "Right answer? The contract pays you. Nobody else can take it.",
    detail: (
      <span className="text-[var(--gold)]">
        +{PRIZE.perSlot} {PRIZE.code}
      </span>
    ),
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
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
        >
          01 How it works
        </p>
        <h2
          id="how-h"
          data-reveal-h2
          className="mt-4 max-w-[16ch] text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Gamified escrow.
        </h2>
        <p
          data-fade
          className="mt-5 max-w-[40rem] text-[18px] leading-[1.55] text-[var(--muted)]"
        >
          A prize locked behind a riddle. Solve it, claim it.
        </p>
        <div className="mt-16 grid grid-cols-1 border-t border-[var(--line)] md:grid-cols-3">
          {STEPS.map(({ n, t, b, detail }, i) => (
            <div
              key={n}
              data-fade
              className={`pt-8 pr-6 pb-2 ${i ? "border-[var(--line)] md:border-l md:pl-7" : ""}`}
            >
              <div className="font-mono text-[12px] text-[var(--dim)]">{n}</div>
              <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">
                {t}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                {b}
              </p>
              <p className="mt-4 font-mono text-[13px]">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Tres públicos concretos (no seis): quién lo usa, qué hace con Loot y qué pasa. */
const USE_CASES: { icon: LucideIcon; who: string; t: string; b: string }[] = [
  {
    icon: Users,
    who: "Communities",
    t: "Run a prize puzzle for your community.",
    b: "Post a riddle in Discord or Telegram. Whoever solves it wins XLM, paid automatically. No one has to send prizes by hand.",
  },
  {
    icon: Megaphone,
    who: "Brands & marketing",
    t: "Turn a campaign into a game.",
    b: "Put a riddle on your product, ad or event page. Fans who solve it win a real prize, and you set the budget up front.",
  },
  {
    icon: Flag,
    who: "Hackathons & events",
    t: "Pay bounties and quests without a spreadsheet.",
    b: "The answer is the flag. Solve it, get paid. The prize is locked from the start, and what isn’t claimed comes back to you.",
  },
];

export function UseCasesSection() {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-h"
      className="border-b border-[var(--line)] py-32"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <p
          data-fade
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
        >
          Who uses it
        </p>
        <h2
          id="use-cases-h"
          data-reveal-h2
          className="mt-4 max-w-[20ch] text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Pay people who know the answer.
        </h2>
        <p
          data-fade
          className="mt-5 max-w-[40rem] text-[18px] leading-[1.55] text-[var(--muted)]"
        >
          Ask a question, lock a prize behind it, share a link. Three ways to use it:
        </p>
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {USE_CASES.map(({ icon: Icon, who, t, b }) => (
            <div
              key={who}
              data-fade
              className="flex flex-col rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-7"
            >
              <Icon aria-hidden className="size-6 text-[var(--proof)]" strokeWidth={1.75} />
              <p className="mt-5 font-mono text-[12px] tracking-[0.06em] text-[var(--proof)]">{who}</p>
              <h3 className="mt-3 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em]">{t}</h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">{b}</p>
            </div>
          ))}
        </div>
        <Link
          href="/create"
          data-fade
          className="btn-landing btn-landing-s mt-10 inline-flex"
        >
          Create a chest
        </Link>
      </div>
    </section>
  );
}

const CHEST_NO = String(DEMO_CHEST.id).padStart(4, "0");

export function AttackSection() {
  const { IS_MAINNET } = useNet();
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
            className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
          >
            02 Attack demo
          </p>
          <h2
            id="attack-h"
            data-reveal-h2
            className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
          >
            Bots can&apos;t steal your prize.
          </h2>
          <p
            data-fade
            className="mt-5 text-[18px] leading-[1.55] text-[var(--muted)]"
          >
            Even if a bot copies your answer, the prize still goes to you.
          </p>
          {IS_MAINNET ? (
            <button
              type="button"
              onClick={() => switchNetwork("testnet")}
              data-fade
              className="btn-landing btn-landing-s mt-8 inline-flex"
            >
              Switch to Testnet
            </button>
          ) : (
            <Link
              href="/attack"
              data-fade
              className="btn-landing btn-landing-s mt-8 inline-flex"
            >
              Run the demo
            </Link>
          )}
        </div>

        <div
          data-term
          role="region"
          aria-label="Attack replay log"
          className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] px-7 py-6"
        >
          <p className="mb-3">
            <ExampleTag>illustrative replay</ExampleTag>
          </p>
          <pre className="overflow-x-auto font-mono text-[13px] leading-[2.1] text-[var(--muted)] md:text-[14px]">
            <span data-term-line className="block">
              $ watch mempool --chest {CHEST_NO}
            </span>
            <span data-term-line className="block">
              00.00 <span className="text-[var(--proof)]">you</span> submit π
              sealed to GA7Q…X4ZK
            </span>
            <span data-term-line className="block">
              00.41 <span className="text-[var(--red)]">bot</span> copy π,
              resend from GBOT…7Q1
            </span>
            <span data-term-line className="block">
              00.80 chain verify(π, recipient=GBOT…7Q1)
            </span>
            <span data-term-line="rejected" className="block text-[var(--red)]">
              REJECTED proof bound to GA7Q…X4ZK, not GBOT…7Q1
            </span>
            <span data-term-line className="block">
              01.20 chain verify(π, recipient=GA7Q…X4ZK)
            </span>
            <span data-term-line className="block text-[var(--ok)]">
              VERIFIED prize released{" "}
              <span className="text-[var(--gold)]">
                {PRIZE.perSlot} {PRIZE.code}
              </span>
            </span>
            <span data-term-line className="block">
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
      className="border-b border-[var(--line)] px-6 py-[120px]"
    >
      <div className="landing-panel-grid mx-auto max-w-[1368px] rounded-[28px] border border-[var(--line)] px-6 py-[120px] text-center">
        <LogoChest
          deg={30}
          showInside
          className="mx-auto mb-10 h-[200px] w-[200px]"
        />
        <h2
          id="cta-h"
          data-reveal-h2
          className="text-[clamp(36px,4.5vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          The next chest is waiting.
        </h2>
        <p
          data-fade
          className="mx-auto mt-5 max-w-[38rem] text-[18px] leading-[1.55] text-[var(--muted)]"
        >
          Bring a wallet and a sharp mind. We bring the bots that will fail.
        </p>
        <div data-fade className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/explore"
            className="btn-landing btn-landing-p"
          >
            Open a chest →
          </Link>
          <Link href="/create" className="btn-landing btn-landing-s">
            Create a chest
          </Link>
        </div>
      </div>
    </section>
  );
}

const KUYFI_URL = "https://kuyfi.vercel.app/";
const KUYFI_REPO = "https://github.com/alex0tico/kuyfi";
const KUYFI_ACCENT = "#C98CC7";
/** Placeholder until the public repo URL is provided. */
const REPORTS_URL = "#";

const SECURITY_ITEMS: { k: string; h: string; hc: string; b: string }[] = [
  {
    k: "Owner",
    h: "Only you can claim",
    hc: "text-[var(--proof)]",
    b: "Your answer is tied to your address. A copy won't work for anyone else.",
  },
  {
    k: "Once",
    h: "One claim per answer",
    hc: "",
    b: "The same answer can't be used twice.",
  },
  {
    k: "Coming soon",
    h: "One contract per chest",
    hc: "text-[var(--gold)]",
    b: "Each chest will get its own contract, so a problem in one can't touch the others.",
  },
];

export function SecuritySection({ kuyfiBadge }: { kuyfiBadge?: React.ReactNode }) {
  const { mainnetReady } = useNet();
  return (
    <section
      id="security"
      aria-labelledby="security-h"
      className="border-b border-[var(--line)] py-32"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <p
          data-fade
          className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
        >
          04 Security
        </p>
        <h2
          id="security-h"
          data-reveal-h2
          className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          What protects a chest.
        </h2>
        <div className="mt-16 grid grid-cols-1 border-t border-[var(--line)] md:grid-cols-3">
          {SECURITY_ITEMS.map((s, i) => (
            <div
              key={s.k}
              data-fade
              className={`pt-8 ${i ? "border-[var(--line)] md:border-l md:pl-7" : ""} ${i < 2 ? "md:pr-7" : ""}`}
            >
              <div className="font-mono text-[12px] text-[var(--dim)]">{s.k}</div>
              <h3
                className={`mt-3 text-[22px] font-semibold tracking-[-0.02em] ${s.hc}`}
              >
                {s.h}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                {s.b}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid grid-cols-1 items-center gap-12 border-t border-[var(--line)] pt-12 lg:grid-cols-2 lg:gap-16">
          <div>
            {/* viewBox del SVG ya recortado al contorno del logo: se muestra entero. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
            <img
              data-fade
              src="/brand/kuyfi.svg"
              alt="Kuyfi, Before the Breach."
              width={1319}
              height={603}
              className="block h-auto w-[260px] max-w-full"
            />
            <h3
              data-fade
              className="mt-6 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]"
            >
              Security-scanned contracts.
            </h3>
            <p data-fade className="mt-4 text-[17px] leading-[1.6] text-[var(--muted)]">
              We test our live contracts with Kuyfi, an open-source scanner that
              attacks them the way a hacker would.
            </p>
            <a
              data-fade
              href={KUYFI_REPO}
              target="_blank"
              rel="noreferrer"
              className="focus-landing mt-4 inline-block text-[15px] underline-offset-4 hover:underline"
              style={{ color: KUYFI_ACCENT }}
            >
              View Kuyfi on GitHub →
            </a>
          </div>

          <div
            data-fade
            className="flex flex-col gap-5 rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-[22px] font-semibold tracking-[-0.02em]">
                Contracts scanned with{" "}
                <a
                  href={KUYFI_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-landing underline underline-offset-4"
                  style={{ color: KUYFI_ACCENT }}
                >
                  Kuyfi
                </a>
              </h3>
              {kuyfiBadge}
            </div>
            <p className="text-[15px] leading-[1.55] text-[var(--muted)]">
              {mainnetReady
                ? "Black-box scan of the same bytecode on testnet, not a full audit. A full audit is planned via the SCF Audit Bank. Mainnet has prize caps."
                : "Black-box scan, not a full audit. A full audit is planned via the SCF Audit Bank before mainnet."}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={KUYFI_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                About Kuyfi ↗
              </a>
              <a href={REPORTS_URL} className="btn-landing btn-landing-s btn-landing-sm">
                Scan reports on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
