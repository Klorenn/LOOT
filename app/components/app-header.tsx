"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/logo-chest";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/attack", label: "Attack demo" },
  { href: "/create", label: "Create" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

/**
 * Header de las rutas de la app. Misma estructura que components/app/app-nav.tsx
 * más el acceso a "Mi wallet" cuando hay sesión (app-nav no se toca: es de otra persona).
 */
export function AppHeader() {
  const path = usePathname();
  const { ready, address } = useSession();

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
          <span className="hidden items-center gap-2 font-mono text-[13px] text-[var(--dim)] sm:inline-flex">
            <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
            Testnet
          </span>
          {!ready ? (
            <span className="btn-landing btn-landing-s btn-landing-sm invisible" aria-hidden>
              Connect
            </span>
          ) : address ? (
            <Link
              href="/wallet"
              aria-label="Mi wallet"
              className="btn-landing btn-landing-s btn-landing-sm font-mono"
            >
              Mi wallet · {shortAddr(address)}
            </Link>
          ) : (
            <Link href="/enter" className="btn-landing btn-landing-p btn-landing-sm">
              Connect
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
