"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

const ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/claimed-chests", label: "My claimed chests" },
  { href: "/qr", label: "Receive / share QR" },
  { href: "/dashboard", label: "Creator dashboard" },
] as const;

/** Account button + attached dropdown (260px, s1, 1px line, radius 10, no shadow). */
export function AccountMenu({ address }: { address: string }) {
  const { player, disconnect } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    // La cuenta de demo vive solo en este navegador: cerrar sesión pierde su clave.
    if (
      player?.kind === "classic" &&
      !window.confirm(
        "This demo account only exists in this browser. Signing out loses its key for good. Continue?",
      )
    )
      return;
    setOpen(false);
    await disconnect();
    router.push("/");
  }

  const kind =
    player?.kind === "passkey"
      ? "Passkey smart account"
      : player?.kind === "wallet"
        ? "Stellar wallet"
        : "Demo account";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn-landing btn-landing-s btn-landing-sm gap-2 font-mono"
      >
        <Avatar seed={address} size="xs" />
        {shortAddr(address)}
        <span className="text-[var(--dim)]" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[260px] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--s1)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--line)] p-4">
            <Avatar seed={address} size="sm" />
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{kind}</p>
              <p
                className="truncate font-mono text-[12px] text-[var(--dim)]"
                title={address}
              >
                {shortAddr(address, 6)}
              </p>
            </div>
          </div>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--muted)] hover:bg-[var(--s2)] hover:text-[var(--text)]"
            >
              {i.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="block w-full px-4 py-3 text-left text-[14px] text-[var(--red)] hover:bg-[var(--s2)]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
