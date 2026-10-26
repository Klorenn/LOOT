"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CellsCanvas } from "@/components/cells-canvas";
import { CopyField } from "@/components/copy-field";
import { KV } from "@/components/kv";
import {
  readPrizeBalance,
  readWonChests,
  type WonChestsResult,
} from "@/lib/chain";
import { chestPath } from "@/lib/chest-code";
import { PRIZE, stroopsToXlm, tokenDecimals } from "@/lib/config";
import { expertAddress, shortAddr } from "@/lib/format";
import { HANDLE_HINT, HANDLE_RE, setHandle, useHandle } from "@/lib/handle";
import { useSession } from "@/lib/session";
import { useNet } from "@/components/network-provider";

type Load<T> = { s: "loading" } | { s: "ok"; v: T } | { s: "error" };

export default function ProfilePage() {
  const { CONTRACTS, SAMPLE_CHEST_ID, NETWORK_LABEL, NETWORK } = useNet();
  const router = useRouter();
  const { address, player, disconnect } = useSession();
  const [balance, setBalance] = useState<Load<bigint>>({ s: "loading" });
  const [won, setWon] = useState<Load<WonChestsResult>>({ s: "loading" });
  const handle = useHandle(address);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [handleErr, setHandleErr] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!address) return;
    const mine = ++seq.current;
    setBalance({ s: "loading" });
    setWon({ s: "loading" });
    const [b, w] = await Promise.allSettled([
      readPrizeBalance(address),
      readWonChests(address),
    ]);
    if (mine !== seq.current) return;
    setBalance(
      b.status === "fulfilled" ? { s: "ok", v: b.value } : { s: "error" },
    );
    setWon(w.status === "fulfilled" ? { s: "ok", v: w.value } : { s: "error" });
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!address || !player) return null;

  const accountType =
    player.kind === "passkey"
      ? "Passkey smart account"
      : player.kind === "wallet"
        ? "Stellar account (G…)"
        : "Demo account (this browser only)";
  const signer =
    player.kind === "passkey"
      ? {
          letter: "P",
          color: "var(--proof)",
          name: "Passkey · this device",
          meta: player.keyId
            ? `key ${player.keyId.slice(0, 8)}…`
            : "primary signer",
        }
      : player.kind === "wallet"
        ? {
            letter: "W",
            color: "var(--gold)",
            name: `Wallet · ${player.walletId ?? "Stellar Wallets Kit"}`,
            meta: shortAddr(address),
          }
        : {
            letter: "D",
            color: "var(--dim)",
            name: "Demo keypair · this browser",
            meta: shortAddr(address),
          };

  const claims = won.s === "ok" ? won.v.items : [];
  const xlmClaimed = claims.reduce(
    (acc, c) => acc + (c.token === CONTRACTS.token ? c.prize : BigInt(0)),
    BigInt(0),
  );

  function saveHandle() {
    const h = draft.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) {
      setHandleErr(HANDLE_HINT);
      return;
    }
    setHandle(address!, h);
    setEditing(false);
    setHandleErr(null);
  }

  return (
    <main>
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
        >
          <CellsCanvas cx={0.85} />
        </div>
        <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col gap-8 px-6 pt-[72px] pb-14 lg:flex-row lg:items-end">
          <Avatar seed={address} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">
              Profile ·{" "}
              <span
                className="size-[6px] rounded-full bg-[var(--ok)]"
                aria-hidden
              />
              <span className="text-[var(--ok)]">{NETWORK_LABEL}</span>
            </p>
            <h1 className="mt-3 text-[clamp(40px,6vw,56px)] leading-[1] font-semibold tracking-[-0.04em]">
              {handle ? `@${handle}` : accountType}
            </h1>
            <div className="mt-5 flex max-w-[640px] flex-wrap items-center gap-2">
              <CopyField value={address} className="min-w-0 flex-1" />
              <a
                href={expertAddress(NETWORK.explorerUrl, address)}
                target="_blank"
                rel="noreferrer"
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                Stellar Expert ↗
              </a>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/wallet?tab=receive" className="btn-landing btn-landing-s">
              Wallet
            </Link>
            <Link href={chestPath(SAMPLE_CHEST_ID)} className="btn-landing btn-landing-p">
              Open a chest
            </Link>
          </div>
        </div>
      </header>

      <section
        aria-label="Account stats"
        className="border-b border-[var(--line)]"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 px-6 sm:grid-cols-3">
          {[
            {
              k: "Chests solved · last 7 days",
              v: won.s === "ok" ? String(claims.length) : "—",
              c: "text-[var(--ok)]",
            },
            {
              k: "XLM claimed · last 7 days",
              v:
                won.s === "ok"
                  ? stroopsToXlm(xlmClaimed, tokenDecimals(""))
                  : "—",
              c: "text-[var(--gold)]",
              unit: PRIZE.code,
            },
            {
              k: "Balance",
              v: balance.s === "ok" ? stroopsToXlm(balance.v) : "—",
              c: "text-[var(--text)]",
              unit: PRIZE.code,
            },
          ].map((cell, i) => (
            <div
              key={cell.k}
              className={`py-8 ${i ? "border-[var(--line)] sm:border-l sm:pl-7" : ""}`}
            >
              <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]">
                {cell.k}
              </p>
              <p
                className={`mt-3 font-mono text-[clamp(30px,4vw,44px)] font-medium tracking-[-0.03em] ${cell.c}`}
              >
                {cell.v}
                {cell.unit && cell.v !== "—" && (
                  <span className="ml-2 text-[20px] text-[var(--gold)]">
                    {cell.unit}
                  </span>
                )}
              </p>
              {cell.k === "Balance" && (
                <Link href="/wallet?tab=send" className="btn-landing btn-landing-s btn-landing-sm mt-3">
                  Send
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-14 lg:grid-cols-2">
        <section>
          <h2 className="font-mono text-[12px] tracking-[0.1em] text-[var(--dim)] uppercase">
            Signers
          </h2>
          <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            <div className="flex items-center gap-4 p-4">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-[8px] font-mono text-[12px] font-semibold text-[var(--bg)]"
                style={{ background: signer.color }}
              >
                {signer.letter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{signer.name}</p>
                <p className="font-mono text-[12px] text-[var(--dim)]">
                  {signer.meta} · current session
                </p>
              </div>
              <span className="flex items-center gap-2 font-mono text-[12px] text-[var(--ok)]">
                <span
                  className="size-[6px] rounded-full bg-[var(--ok)]"
                  aria-hidden
                />{" "}
                active
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] p-4">
              <button
                type="button"
                disabled
                className="btn-landing btn-landing-s btn-landing-sm opacity-50"
              >
                + Add passkey
              </button>
              <button
                type="button"
                disabled
                className="btn-landing btn-landing-s btn-landing-sm opacity-50"
              >
                + Link wallet
              </button>
              <span className="font-mono text-[12px] text-[var(--dim)]">
                coming soon
              </span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-mono text-[12px] tracking-[0.1em] text-[var(--dim)] uppercase">
            Settings
          </h2>
          <div className="mt-4">
            <KV
              rows={[
                {
                  label: "Network",
                  value: (
                    <span>
                      <span className="mr-2 inline-block size-[6px] rounded-full bg-[var(--ok)]" />
                      {NETWORK_LABEL}
                    </span>
                  ),
                },
                { label: "Account type", value: accountType },
                { label: "Gas", value: "OpenZeppelin Relayer · 0 XLM needed" },
                {
                  label: "Handle",
                  value: editing ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[var(--dim)]">@</span>
                      <input
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setHandleErr(null);
                        }}
                        maxLength={20}
                        aria-label="Handle"
                        className="h-8 w-36 rounded-[8px] border border-[var(--line)] bg-[var(--bg)] px-2 font-mono text-[13px] outline-none focus-visible:border-[var(--proof)]"
                      />
                      <button
                        type="button"
                        onClick={saveHandle}
                        className="text-[var(--proof)] underline"
                      >
                        save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="text-[var(--dim)] underline"
                      >
                        cancel
                      </button>
                      {handleErr && (
                        <span className="w-full text-[var(--red)]">
                          {handleErr}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>
                      {handle ? `@${handle}` : "—"}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(handle ?? "");
                          setEditing(true);
                        }}
                        className="ml-2 text-[var(--proof)] underline"
                      >
                        {handle ? "edit" : "set"}
                      </button>
                      <span className="ml-3 text-[var(--dim)]">
                        stored only in this browser
                      </span>
                    </span>
                  ),
                },
                {
                  label: "Session",
                  value: "kept on this device until you sign out",
                },
              ]}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <Link href="/claimed-chests" className="btn-landing btn-landing-s">
              My claimed chests
            </Link>
            {!confirmOut ? (
              <button
                type="button"
                onClick={() => setConfirmOut(true)}
                className="btn-landing btn-landing-s border-[var(--red)] text-[var(--red)]"
              >
                Sign out
              </button>
            ) : (
              <div className="w-full space-y-3 rounded-[10px] border border-[var(--line)] border-l-[3px] border-l-[var(--red)] bg-[var(--s1)] p-4">
                <p className="text-[14px] leading-[1.5] text-[var(--muted)]">
                  This clears the session on this device.{" "}
                  {player.kind === "classic" && (
                    <strong className="text-[var(--red)]">
                      This demo account only exists in this browser: signing out
                      loses its key for good.{" "}
                    </strong>
                  )}
                  Your player secret (it produces your proofs’ nullifier) stays
                  on this device and is lost if you clear the browser’s data.
                  Your passkey is never deleted.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await disconnect();
                      router.push("/");
                    }}
                    className="btn-landing btn-landing-p btn-landing-sm"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOut(false)}
                    className="btn-landing btn-landing-s btn-landing-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
