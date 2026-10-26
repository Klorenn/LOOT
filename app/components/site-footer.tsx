"use client";

import Link from "next/link";
import { BrandMark } from "@/components/logo-chest";
import { CellsBackground } from "@/components/cells-background";
import { BetaNotice } from "@/components/network-banner";
import { NetworkSwitch } from "@/components/network-switch";
import { useNet } from "@/components/network-provider";

/** Loot footer (landing + app). Reemplaza components/app/site-footer.tsx (de otra persona). */
export function SiteFooter() {
  const { CONTRACTS, IS_MAINNET, NETWORK } = useNet();
  const SHORT = CONTRACTS.chest ? `${CONTRACTS.chest.slice(0, 4)}…${CONTRACTS.chest.slice(-4)}` : "not configured";
  const NET = NETWORK.name.charAt(0) + NETWORK.name.slice(1).toLowerCase();

  const columns = [
    [
      "Product",
      [
        ["/explore", "Open chests"],
        ["/create", "Create a chest"],
        ["/dashboard", "Dashboard"],
        ...(IS_MAINNET ? [] : [["/attack", "Attack demo"]]),
      ],
    ],
    [
      "Developers",
      [
        ["/sdk", "Docs"],
        ["#", "Circuits"],
        [
          `${NETWORK.explorerUrl}/contract/${CONTRACTS.chest}`,
          "Soroban contract",
        ],
        ["https://github.com/Klorenn/LOOT", "GitHub"],
      ],
    ],
    [
      "Stellar",
      [
        [NETWORK.explorerUrl, "Stellar Expert"],
        ["https://freighter.app", "Freighter wallet"],
        ["https://developers.stellar.org/docs/build", "Soroban docs"],
        ...(NETWORK.friendbotUrl ? [[NETWORK.friendbotUrl, "Testnet faucet"]] : []),
      ],
    ],
    [
      "Community",
      [
        ["#", "X / Twitter"],
        ["#", "Discord"],
        ["https://meridian.stellar.org", "HackMeridian 2026"],
        ["#", "Contact"],
      ],
    ],
  ] as const;


  return (
    <footer
      data-footer
      className="relative mt-auto overflow-hidden border-t border-[var(--line)] pt-24"
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
              {NET} · contract {SHORT}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <NetworkSwitch />
              <BetaNotice compact />
            </div>
          </div>
          {columns.map(([title, links]) => (
            <div key={title} data-fade>
              <div className="font-mono text-[12px] font-medium tracking-[0.1em] text-[var(--dim)] uppercase">
                {title}
              </div>
              <ul className="mt-4">
                {links.map(([href, label]) => (
                  <li key={label} className="leading-[2.2]">
                    {href.startsWith("http") || href.startsWith("mailto:") || href === "#" ? (
                      <a
                        href={href}
                        className="focus-landing text-[14px] text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        {label}
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="focus-landing text-[14px] text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-[72px] flex flex-col justify-between gap-3 border-t border-[var(--line)] py-[22px] text-[13px] text-[var(--dim)] sm:flex-row">
          <span>© 2026 Loot · Built on Stellar for HackMeridian 2026</span>
          <span className="flex gap-4">
            <a href="#" className="hover:text-[var(--text)]">
              Terms
            </a>
            <a href="#" className="hover:text-[var(--text)]">
              Privacy
            </a>
            <Link href="/#security" className="hover:text-[var(--text)]">
              Security
            </Link>
          </span>
        </div>

      </div>
      <div
          data-wordmark
          aria-hidden
          className="relative z-10 select-none overflow-hidden text-center font-semibold text-[var(--wordmark)]"
          style={{
            fontSize: "38vw",
            lineHeight: 0.74,
            letterSpacing: "-2.2vw",
            height: "0.6em",
          }}
        >
          LOOT
        </div>
    </footer>
  );
}
