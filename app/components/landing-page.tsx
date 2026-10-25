"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CONTRACTS } from "@/lib/config";
import { initLandingMotion } from "@/lib/landing-motion";
import { BrandMark, LogoChest } from "@/components/logo-chest";
import { CellsBackground } from "@/components/cells-background";
import { ScrollProgress } from "@/components/scroll-progress";
import { SmoothScroll } from "@/components/smooth-scroll";

const SHORT = `${CONTRACTS.chest.slice(0, 8)}…${CONTRACTS.chest.slice(-4)}`;

/** Honest testnet stats from our own demo (not invented XLM). */
const STATS = {
  paid: 200,
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
                ["#how", "Product"],
                ["#how", "How it works"],
                ["#attack", "Security"],
                ["https://github.com", "Docs"],
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
                Launch app
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
                  <span className="text-[var(--proof)]">can’t rob.</span>
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
                </div>
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
                />
              </div>
            </div>
          </header>

          {/* Stack */}
          <div
            data-fade
            className="border-b border-[var(--line)] py-9"
          >
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 font-mono">
              <span className="text-[12px] tracking-[0.08em] text-[var(--dim)]">
                BUILT ON
              </span>
              {[
                "Stellar",
                "Soroban",
                "Circom",
                "snarkjs",
                "OpenZeppelin",
                "Freighter",
              ].map((t) => (
                <span
                  key={t}
                  className="text-[18px] font-semibold text-[var(--muted)] md:text-[21px]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* How */}
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
                01 — How it works
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
                The answer never leaves your device. The proof carries your
                address. The contract only pays the address inside the proof.
              </p>
              <div className="mt-16 grid grid-cols-1 border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    n: "01",
                    t: "Solve locally",
                    b: "Crack the riddle in your browser. Only a hash of the answer exists.",
                    d: "hash → 0x5c1e…a77f",
                    c: "text-[var(--muted)]",
                  },
                  {
                    n: "02",
                    t: "Seal it to you",
                    b: "A ZK proof binds the answer to your Stellar address as a public input.",
                    d: "prover: GA7Q…X4ZK",
                    c: "text-[var(--proof)]",
                  },
                  {
                    n: "03",
                    t: "Claim the prize",
                    b: "Soroban checks the proof and the sender in one call, then pays out.",
                    d: "+100 CHEST",
                    c: "text-[var(--gold)]",
                  },
                  {
                    n: "04",
                    t: "Spent once",
                    b: "Every claim burns a nullifier. Replaying the same proof reverts.",
                    d: "replay → reverted",
                    c: "text-[var(--red)]",
                  },
                ].map((s, i) => (
                  <div
                    key={s.n}
                    data-fade
                    className={`pt-8 pr-0 pb-4 ${i ? "border-[var(--line)] sm:border-l sm:pl-7" : ""}`}
                  >
                    <div className="font-mono text-[12px] text-[var(--dim)]">
                      {s.n}
                    </div>
                    <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">
                      {s.t}
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                      {s.b}
                    </p>
                    <code
                      className={`mt-4 block font-mono text-[12px] ${s.c}`}
                    >
                      {s.d}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Attack */}
          <section
            id="attack"
            data-attack
            aria-labelledby="attack-h"
            className="flex min-h-screen items-center border-b border-[var(--line)] py-0"
          >
            <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
              <div>
                <p
                  data-fade
                  className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)]"
                >
                  02 — Attack demo
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
                  Front-running bots resend winning transactions with a higher
                  fee. On ChestZK the copy fails, because the proof only verifies
                  for the address that made it.
                </p>
                <Link
                  href="/attack"
                  data-fade
                  className="btn-landing btn-landing-s mt-8 inline-flex"
                >
                  Run the demo
                </Link>
              </div>
              <pre
                data-term
                aria-label="Attack replay log"
                className="overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6 font-mono text-[13px] leading-[2.1] text-[var(--muted)] md:text-[14px] md:p-7"
              >
                <span data-term-line className="block">
                  $ watch mempool --chest 0421
                </span>
                <span data-term-line className="block">
                  00.00{" "}
                  <span className="text-[var(--proof)]">you</span> submit π
                  sealed to GA7Q…X4ZK
                </span>
                <span data-term-line className="block">
                  00.41 <span className="text-[var(--red)]">bot</span> copy π,
                  resend from GBOT…7Q1, fee ×12
                </span>
                <span data-term-line className="block">
                  00.80 chain verify(π, sender=GBOT…7Q1)
                </span>
                <span
                  data-term-line="rejected"
                  className="block text-[var(--red)]"
                >
                  REJECTED sender ≠ prover · proof bound to GA7Q…X4ZK
                </span>
                <span data-term-line className="block">
                  01.20 chain verify(π, sender=GA7Q…X4ZK)
                </span>
                <span data-term-line className="block">
                  <span className="text-[var(--ok)]">VERIFIED</span> prize
                  released{" "}
                  <span className="text-[var(--gold)]">100 CHEST</span>
                </span>
                <span data-term-line className="block">
                  $ <span className="cursor-blink">▌</span>
                </span>
              </pre>
            </div>
          </section>

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
                    b: "One claim per chest, ever.",
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
                      CHEST
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

          {/* CTA */}
          <section className="border-b border-[var(--line)] py-[180px] text-center">
            <div className="mx-auto max-w-[1200px] px-6">
              <h2
                data-reveal-h2
                className="text-[clamp(36px,4.5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]"
              >
                The next chest is waiting.
              </h2>
              <p
                data-fade
                className="mx-auto mt-5 max-w-[28rem] text-[18px] leading-[1.55] text-[var(--muted)]"
              >
                Bring a wallet and a sharp mind. We bring the bots that will
                fail.
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
          </section>
        </main>

        {/* Footer */}
        <footer
          data-footer
          className="relative overflow-hidden border-t border-[var(--line)] pt-24"
        >
          <CellsBackground variant="footer" />
          <div className="relative z-10 mx-auto max-w-[1200px] px-6">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-10">
              <div data-fade className="md:col-span-2 lg:col-span-1">
                <BrandMark />
                <p className="mt-4 max-w-[300px] text-[15px] leading-[1.55] text-[var(--muted)]">
                  Puzzle chests with prizes only the rightful solver can claim.
                  Proofs sealed to your address.
                </p>
                <p className="mt-5 flex items-center gap-2 font-mono text-[12px] whitespace-nowrap text-[var(--muted)]">
                  <span
                    className="status-dot inline-block size-[7px] rounded-full bg-[var(--ok)]"
                    aria-hidden
                  />
                  Testnet · contract {SHORT}
                </p>
              </div>
              {(
                [
                  [
                    "Product",
                    [
                      ["/chest/2", "Open chests"],
                      ["/create", "Create a chest"],
                      ["/panel", "Leaderboard"],
                      ["/attack", "Attack demo"],
                    ],
                  ],
                  [
                    "Developers",
                    [
                      ["https://developers.stellar.org", "Docs"],
                      ["/create", "Circuits"],
                      [
                        `https://stellar.expert/explorer/testnet/contract/${CONTRACTS.chest}`,
                        "Soroban contract",
                      ],
                      ["https://github.com", "GitHub"],
                    ],
                  ],
                  [
                    "Stellar",
                    [
                      ["https://stellar.expert/explorer/testnet", "Stellar Expert"],
                      ["https://freighter.app", "Freighter wallet"],
                      ["https://developers.stellar.org/docs/build", "Soroban docs"],
                      ["https://friendbot.stellar.org", "Testnet faucet"],
                    ],
                  ],
                  [
                    "Community",
                    [
                      ["https://x.com", "X / Twitter"],
                      ["https://discord.com", "Discord"],
                      ["https://meridian.stellar.org", "HackMeridian 2026"],
                      ["mailto:hello@chestzk.dev", "Contact"],
                    ],
                  ],
                ] as const
              ).map(([title, links]) => (
                <div key={title} data-fade>
                  <div className="font-mono text-[12px] font-medium tracking-[0.1em] text-[var(--dim)] uppercase">
                    {title}
                  </div>
                  <ul className="mt-4">
                    {links.map(([href, label]) => (
                      <li key={label} className="leading-[2.2]">
                        <a
                          href={href}
                          className="focus-landing text-[14px] text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-[72px] flex flex-col justify-between gap-3 border-t border-[var(--line)] py-[22px] text-[13px] text-[var(--dim)] sm:flex-row">
              <span>© 2026 ChestZK · Built on Stellar for HackMeridian 2026</span>
              <span className="flex gap-4">
                <a href="#main" className="hover:text-[var(--text)]">
                  Terms
                </a>
                <a href="#main" className="hover:text-[var(--text)]">
                  Privacy
                </a>
                <a href="#attack" className="hover:text-[var(--text)]">
                  Security
                </a>
              </span>
            </div>

            <div
              data-wordmark
              aria-hidden
              className="select-none overflow-hidden text-center font-semibold text-[var(--wordmark)]"
              style={{
                fontSize: "23.5vw",
                lineHeight: 0.74,
                letterSpacing: "-1.2vw",
                height: "0.6em",
              }}
            >
              CHESTZK
            </div>
          </div>
        </footer>
      </div>
    </SmoothScroll>
  );
}
