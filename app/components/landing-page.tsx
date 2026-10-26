"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { initLandingMotion } from "@/lib/landing-motion";
import { NetworkSelect } from "@/components/network-switch";
import { BrandMark, LogoChest } from "@/components/logo-chest";
import { CellsBackground } from "@/components/cells-background";
import { SiteFooter } from "@/components/site-footer";
import {
  AttackSection,
  CtaSection,
  HeroStats,
  HowSection,
  SecuritySection,
  UseCasesSection,
  type Stats,
} from "@/components/landing-sections";
import { ScrollProgress } from "@/components/scroll-progress";
import { SmoothScroll } from "@/components/smooth-scroll";
import { StackMarquee } from "@/components/stack-marquee";
import { AudienceSection } from "@/components/landing/audience-section";
import { SdkBlock } from "@/components/landing/sdk-block";
import { chestPath } from "@/lib/chest-code";
import { PRIZE, stroopsToXlm } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useNet } from "@/components/network-provider";

const DOCS_URL = "https://github.com/Klorenn/LOOT";

const NO_STATS: Stats = { paid: "…", claims: "…", created: "…" };

/** Real counters from on-chain events (/api/stats); never invented. */
function useStats(): Stats {
  const [stats, setStats] = useState<Stats>(NO_STATS);
  useEffect(() => {
    let live = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j || j.error) return;
        setStats({
          paid: stroopsToXlm(j.paidStroops),
          claims: String(j.claims),
          created: String(j.created),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return stats;
}

export function LandingPage({ kuyfiBadge }: { kuyfiBadge?: React.ReactNode }) {
  const { SAMPLE_CHEST_ID, NETWORK_LC } = useNet();
  const root = useRef<HTMLDivElement>(null);
  const stats = useStats();
  const { ready, address } = useSession();

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
        <nav className="absolute top-[var(--network-strip-h)] right-0 left-0 z-50 h-20">
          <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
            <Link href="/" className="focus-landing inline-flex items-center">
              <BrandMark />
            </Link>
            <div className="hidden items-center gap-8 md:flex">
              {[
                ["/explore", "Explore"],
                ["#how", "How it works"],
                ["#security", "Security"],
                [DOCS_URL, "Docs"],
                ["/sdk", "SDK"],
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
              <span className="hidden md:inline-flex">
                <NetworkSelect />
              </span>
              {ready && address ? (
                <Link
                  href="/profile"
                  className="btn-landing btn-landing-s btn-landing-sm font-mono"
                >
                  Profile · {shortAddr(address)}
                </Link>
              ) : (
                <Link href="/login" className="btn-landing btn-landing-s btn-landing-sm">
                  Log in
                </Link>
              )}
              <Link
                href={`/login?next=${chestPath(SAMPLE_CHEST_ID)}`}
                className="btn-landing btn-landing-p btn-landing-sm"
              >
                Launch app →
              </Link>
            </div>
          </div>
        </nav>
        {/* móvil: selector de red bajo la barra */}
        <div className="absolute top-[calc(var(--network-strip-h)+5rem)] right-0 left-0 z-40 flex justify-center md:hidden">
          <NetworkSelect />
        </div>

        <main id="main">
          {/* Hero */}
          <header
            data-hero
            className="hero relative min-h-[760px] overflow-hidden border-b border-[var(--line)]"
            style={{ height: "calc(100vh - var(--network-strip-h))" }}
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
                  Live on Stellar {NETWORK_LC}
                </p>
                <h1
                  data-reveal-h1
                  className="max-w-[14ch] text-[clamp(52px,7vw,92px)] leading-[0.98] font-semibold tracking-[-0.04em]"
                >
                  Solve the riddle.{" "}
                  <span className="text-[var(--proof)]">Win the prize.</span>
                </h1>
                <p
                  data-hero-fade
                  className="mt-6 max-w-[36rem] text-[18px] leading-[1.55] text-[var(--muted)]"
                >
                  Anyone can lock XLM behind a riddle. Solve it and the prize is
                  yours. Bots can&apos;t steal it.
                </p>
                <div data-hero-fade className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={`/login?next=${chestPath(SAMPLE_CHEST_ID)}`}
                    className="btn-landing btn-landing-p"
                  >
                    Open a chest →
                  </Link>
                  <a href="#how" className="btn-landing btn-landing-s">
                    How it works
                  </a>
                </div>
                <HeroStats stats={stats} />
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

          <HowSection />
          <UseCasesSection />
          <AttackSection />
          <AudienceSection docsUrl={DOCS_URL} />

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
                03 Stellar × ZK
              </p>
              <h2
                id="sxzk-h"
                data-reveal-h2
                className="mt-4 text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
              >
                Built on Stellar.
              </h2>
              <div className="mt-16 grid grid-cols-1 border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    k: "Privacy",
                    h: "Answer stays secret",
                    hc: "text-[var(--proof)]",
                    b: "You prove you know it without showing it.",
                  },
                  {
                    k: "Cost",
                    h: `0 ${PRIZE.code} to play`,
                    hc: "",
                    b: "We cover the network fees for you.",
                  },
                  {
                    k: "Speed",
                    h: "Paid in seconds",
                    hc: "text-[var(--ok)]",
                    b: "Stellar confirms the payout in about 5 seconds.",
                  },
                  {
                    k: "Prize",
                    h: `Real ${PRIZE.code}`,
                    hc: "text-[var(--gold)]",
                    b: "Sent straight to your wallet. No setup needed.",
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
                    <span>{stats.paid}</span>{" "}
                    <small className="text-[20px] text-[var(--gold)]">
                      {PRIZE.code}
                    </small>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    paid to solvers ({NETWORK_LC}, last 7 days)
                  </div>
                </div>
                <div
                  data-fade
                  className="border-[var(--line)] pt-8 sm:border-l sm:pl-7"
                >
                  <b className="font-mono text-[44px] font-medium tracking-[-0.03em] text-[var(--ok)]">
                    <span>{stats.claims}</span>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    verified claims (last 7 days)
                  </div>
                </div>
                <div
                  data-fade
                  className="border-[var(--line)] pt-8 sm:border-l sm:pl-7"
                >
                  <b className="font-mono text-[44px] font-medium tracking-[-0.03em]">
                    <span>{stats.created}</span>
                  </b>
                  <div className="mt-2 text-[15px] text-[var(--muted)]">
                    chests created (last 7 days)
                  </div>
                </div>
              </div>
              <p className="mt-6 font-mono text-[12px] text-[var(--dim)]">
                Live data from the last 7 days on {NETWORK_LC}.
              </p>
            </div>
          </section>

          <SecuritySection kuyfiBadge={kuyfiBadge} />

          <SdkBlock />

          <CtaSection />
        </main>

        <SiteFooter />
      </div>
    </SmoothScroll>
  );
}
