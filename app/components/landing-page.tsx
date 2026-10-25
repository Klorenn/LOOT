"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { initLandingMotion } from "@/lib/landing-motion";
import { BrandMark, LogoChest } from "@/components/logo-chest";
import { CellsBackground } from "@/components/cells-background";
import { SiteFooter } from "@/components/app/site-footer";
import {
  AttackSection,
  CtaSection,
  HeroStats,
  HowSection,
  WhoSection,
} from "@/components/landing-sections";
import { ScrollProgress } from "@/components/scroll-progress";
import { SmoothScroll } from "@/components/smooth-scroll";
import { StackMarquee } from "@/components/stack-marquee";

/** Honest testnet stats from our own demo (not invented XLM). */
const STATS = {
  paid: 5,
  rejected: 1,
  settle: 5,
};

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    return initLandingMotion(root.current);
  }, []);

  return (
    <SmoothScroll>
      <ScrollProgress />
      <div ref={root} className="bg-[var(--bg)] text-[var(--text)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:rounded-[10px] focus:bg-[var(--text)] focus:px-3 focus:py-2 focus:text-[var(--bg)]"
        >
          Skip to content
        </a>

        {/* Nav */}
        <nav className="absolute top-0 right-0 left-0 z-50 h-20">
          <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
            <Link href="/" className="focus-landing">
              <BrandMark />
            </Link>
            <div className="hidden items-center gap-8 md:flex">
              {[
                ["/explore", "Explore"],
                ["#how", "How it works"],
                ["/attack", "Security"],
                ["https://github.com/Klorenn/ChestZK", "Docs"],
              ].map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  className="focus-landing text-sm text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/enter" className="btn-landing btn-landing-s btn-landing-sm">
                Sign in
              </Link>
              <Link
                href="/enter?next=/chest/2"
                className="btn-landing btn-landing-p btn-landing-sm"
              >
                Launch app →
              </Link>
            </div>
          </div>
        </nav>

        <main id="main">
          {/* Hero */}
          <header
            data-hero
            className="hero relative min-h-[760px] overflow-hidden border-b border-[var(--line)]"
            style={{ height: "100vh" }}
          >
            <CellsBackground variant="hero" />
            <div className="relative z-10 mx-auto grid h-full max-w-[1200px] grid-cols-1 items-center gap-10 px-6 pt-20 lg:grid-cols-[1.05fr_.95fr]">
              <div data-hero-copy className="order-2 lg:order-1">
                <p
                  data-hero-fade
                  className="mb-5 flex items-center gap-2 font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]"
                >
                  <span
                    className="status-dot inline-block size-[6px] rounded-full bg-[var(--ok)]"
                    aria-hidden
                  />
                  Live on Stellar testnet
                </p>
                <h1
                  data-reveal-h1
                  className="max-w-[14ch] text-[clamp(52px,7vw,92px)] leading-[0.98] font-semibold tracking-[-0.04em]"
                >
                  Puzzle chests that bots{" "}
                  <span className="text-[var(--proof)]">can’t</span>{" "}
                  <span className="text-[var(--proof-d)]">rob.</span>
                </h1>
                <p
                  data-hero-fade
                  className="mt-6 max-w-[36rem] text-[18px] leading-[1.55] text-[var(--muted)]"
                >
                  Solve it, prove it in zero knowledge, claim the prize. Every
                  proof is sealed to the solver’s address, so a copied answer is
                  worth nothing.
                </p>
                <div data-hero-fade className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/enter?next=/chest/2"
                    className="btn-landing btn-landing-p"
                  >
                    Open a chest →
                  </Link>
                  <a href="#how" className="btn-landing btn-landing-s">
                    How it works
                  </a>
                  <Link href="/attack" className="btn-landing btn-landing-s">
                    See the theft live →
                  </Link>
                </div>
                <HeroStats stats={STATS} />
              </div>
              <div
                data-chest-wrap
                className="order-1 flex justify-center lg:order-2 lg:justify-end"
                style={{
                  filter: "drop-shadow(0 40px 60px rgba(91,94,232,.25))",
                }}
              >
                <LogoChest
                  className="w-[240px] lg:w-[340px]"
                  deg={0}
                  showInside
                  data-hero-chest
                />
              </div>
            </div>
          </header>

          <StackMarquee />

          <WhoSection />
          <HowSection />
          <AttackSection />

          {/* Stellar × ZK */}
          <section
            aria-labelledby="sxzk-h"
            className="border-b border-[var(--line)] py-32"
          >
            <div className="mx-auto max-w-[1200px] px-6">
              <p
                data-fade
                className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
              >
                03 — Stellar × ZK
              </p>
              <h2
                id="sxzk-h"
                data-reveal-h2
                className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
              >
                Fast ledger. Sealed proofs.
              </h2>
              <div className="mt-16 grid grid-cols-1 border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    k: "Proof",
                    h: "Groth16",
                    hc: "text-[var(--proof)]",
                    b: "Prover address as public input.",
                  },
                  {
                    k: "Replay",
                    h: "Nullifiers",
                    hc: "",
                    b: "A proof can't be spent twice.",
                  },
                  {
                    k: "Settlement",
                    h: "~5 s",
                    hc: "text-[var(--ok)]",
                    b: "One Stellar ledger.",
                  },
                  {
                    k: "Fee",
                    h: "< $0.001",
                    hc: "text-[var(--gold)]",
                    b: "Per verified claim.",
                  },
                ].map((s, i) => (
                  <div
                    key={s.k}
                    data-fade
                    className={`pt-8 ${i ? "border-[var(--line)] sm:border-l sm:pl-7" : ""}`}
                  >
                    <div className="font-mono text-[12px] text-[var(--dim)]">
                      {s.k}
                    </div>
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
              <div className="mt-14 grid grid-cols-1 border-t border-[var(--line)] sm:grid-cols-3">
                <div data-fade className="pt-8">
                  <b className="font-mono text-[44px] font-medium tracking-[-0.03em]">
                    <span data-count={STATS.paid}>{STATS.paid}</span>{" "}
                    <small className="text-[20px] text-[var(--gold)]">
                      USDC
                    </small>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    paid to solvers (testnet)
                  </div>
                </div>
                <div
                  data-fade
                  className="border-[var(--line)] pt-8 sm:border-l sm:pl-7"
                >
                  <b className="font-mono text-[44px] font-medium tracking-[-0.03em] text-[var(--red)]">
                    <span data-count={STATS.rejected}>{STATS.rejected}</span>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    bot copies rejected
                  </div>
                </div>
                <div
                  data-fade
                  className="border-[var(--line)] pt-8 sm:border-l sm:pl-7"
                >
                  <b className="font-mono text-[44px] font-medium tracking-[-0.03em] text-[var(--ok)]">
                    <span
                      data-count={STATS.settle}
                      data-prefix="~"
                      data-suffix=" s"
                    >
                      ~{STATS.settle} s
                    </span>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    median settlement
                  </div>
                </div>
              </div>
            </div>
          </section>

          <CtaSection />
        </main>

        <SiteFooter />
      </div>
    </SmoothScroll>
  );
}
