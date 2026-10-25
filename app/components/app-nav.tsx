"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/logo-chest";
import { AccountMenu } from "@/components/account-menu";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/attack", label: "Attack demo" },
  { href: "/create", label: "Create" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sdk", label: "SDK" },
] as const;

/**
 * AppNav de Loot (72px). Reemplaza a components/app/app-nav.tsx (de otra persona, no se toca)
 * con las entradas de cuenta: Log in / Create account, o AccountMenu con sesión.
 */
export function AppNav() {
  const path = usePathname();
  const { ready, address } = useSession();
  const [menu, setMenu] = useState(false);

  return (
    <nav className="sticky top-0 z-50 h-[72px] border-b border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 px-6">
        <Link href="/" className="focus-landing shrink-0">
          <BrandMark />
        </Link>

        <ul className="hidden items-stretch gap-6 self-stretch md:flex">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <li key={l.href} className="flex">
                <Link
                  href={l.href}
                  className={`focus-landing relative flex items-center text-[14px] ${
                    active
                      ? "text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {l.label}
                  {active && (
                    <span
                      className="absolute right-0 bottom-0 left-0 h-[2px] bg-[var(--proof)]"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3">
          {/* .btn-landing fija display:inline-flex y gana a las utilidades: el ocultado va en el wrapper */}
          <span className="md:hidden">
            <button
              type="button"
              className="btn-landing btn-landing-s btn-landing-sm"
              aria-expanded={menu}
              aria-controls="mobile-menu"
              aria-label="Menu"
              onClick={() => setMenu((m) => !m)}
            >
              {menu ? "Close" : "Menu"}
            </button>
          </span>
          <span className="hidden items-center gap-2 font-mono text-[13px] text-[var(--dim)] sm:inline-flex">
            <span
              className="size-[6px] rounded-full bg-[var(--ok)]"
              aria-hidden
            />
            Testnet
          </span>
          {!ready ? (
            <span
              className="btn-landing btn-landing-s btn-landing-sm invisible"
              aria-hidden
            >
              Connect
            </span>
          ) : address ? (
            <AccountMenu address={address} />
          ) : (
            <>
              <Link
                href="/login"
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                Log in
              </Link>
              <span className="hidden sm:block">
                <Link
                  href="/register"
                  className="btn-landing btn-landing-p btn-landing-sm"
                >
                  Create account
                </Link>
              </span>
            </>
          )}
        </div>
      </div>
      {menu && (
        <ul
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-[var(--line)] bg-[var(--bg)] px-6 py-2 md:hidden"
        >
          {LINKS.map((l) => (
            <li
              key={l.href}
              className="border-b border-[var(--line)] last:border-b-0"
            >
              <Link
                href={l.href}
                onClick={() => setMenu(false)}
                className={`block py-3 text-[15px] ${
                  path === l.href || path.startsWith(`${l.href}/`)
                    ? "text-[var(--text)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
          {ready && !address && (
            <li className="py-3">
              <Link
                href="/register"
                onClick={() => setMenu(false)}
                className="btn-landing btn-landing-p btn-landing-sm"
              >
                Create account
              </Link>
            </li>
          )}
        </ul>
      )}
    </nav>
  );
}
