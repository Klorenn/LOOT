"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Em } from "@/components/page-header";
import { StateBlock } from "@/components/state-block";
import { StatusLabel } from "@/components/status-label";
import { Mono } from "@/components/kv";
import { PRIZE, stroopsToXlm } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import type { DashboardData } from "@/lib/listing";
import { useSession } from "@/lib/session";
import { closeChestOnChain, closeLegacyChestOnChain } from "@/lib/create-chest";

type Load = { s: "loading" } | { s: "ok"; v: DashboardData } | { s: "error" };

export default function DashboardPage() {
  const { address, player } = useSession();
  const [data, setData] = useState<Load>({ s: "loading" });
  const [reload, setReload] = useState(0);
  const [closing, setClosing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string; hash?: string } | null>(null);

  async function closeAndRefund(r: DashboardData["rows"][number]) {
    if (!player || closing !== null) return;
    const legacy = r.kind === "legacy";
    const pool = BigInt(r.poolStroops);
    const upTo = r.refundStroops ? BigInt(r.refundStroops) : pool;
    const ok = window.confirm(
      legacy
        ? `Close chest ${r.code}?\n\nThe unclaimed prize (${stroopsToXlm(pool)} XLM) returns to your account. This can't be undone.`
        : `Close chest ${r.code}?\n\n` +
            `Unclaimed prize: ${stroopsToXlm(pool)} XLM, plus the unused part of the prepaid fee reserve ` +
            `(up to ${stroopsToXlm(upTo)} XLM in total) returns to your account. This can't be undone.`,
    );
    if (!ok) return;
    setClosing(r.code);
    setNotice(null);
    try {
      const { hash, refunded } = legacy ? await closeLegacyChestOnChain(player, r.id) : await closeChestOnChain(player, r.address as string);
      setNotice({ tone: "ok", text: `Closed. ${stroopsToXlm(refunded)} XLM returned to your account.`, hash });
      setReload((n) => n + 1);
    } catch (e) {
      setNotice({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setClosing(null);
    }
  }

  useEffect(() => {
    if (!address) return;
    let live = true;
    setData({ s: "loading" });
    fetch(`/api/dashboard?address=${encodeURIComponent(address)}${reload ? "&fresh=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((v: DashboardData) => live && setData({ s: "ok", v }))
      .catch(() => live && setData({ s: "error" }));
    return () => {
      live = false;
    };
  }, [address, reload]);

  if (!address) return null;
  const rows = data.s === "ok" ? data.v.rows : [];

  return (
    <main>
      <PageHeader
        eyebrow={<span>Creator · {shortAddr(address)}</span>}
        title={
          <>
            Your <Em>chests</Em>
          </>
        }
        right={
          <Link href="/create" className="btn-landing btn-landing-p">
            New chest
          </Link>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-12">
        {data.s === "loading" ? (
          <div className="space-y-3" aria-busy>
            {[0, 1].map((i) => (
              <div key={i} className="h-16 rounded-[10px] bg-[var(--s1)] opacity-60" />
            ))}
          </div>
        ) : data.s === "error" ? (
          <StateBlock
            tone="gold"
            label="Chain read failed"
            title="We couldn’t read your chests."
            body="The Stellar testnet RPC didn’t answer. Reload in a moment."
            chest="none"
            actions={[{ href: "/dashboard", label: "Reload", primary: true }]}
          />
        ) : rows.length === 0 ? (
          <StateBlock
            tone="dim"
            label="No chests yet"
            title="You haven’t created a chest yet."
            body="Chests you create from this account show up here, with their escrow and claims."
            chest="closed"
            actions={[{ href: "/create", label: "Create a chest", primary: true }]}
          />
        ) : (
          <>
            <section
              aria-label="Creator stats"
              className="grid grid-cols-1 border-y border-[var(--line)] sm:grid-cols-3"
            >
              {[
                {
                  k: "In escrow",
                  v: stroopsToXlm(data.v.inEscrowStroops),
                  c: "text-[var(--gold)]",
                  unit: PRIZE.code,
                },
                {
                  k: "Paid to solvers · last 7 days",
                  v: stroopsToXlm(data.v.paidStroops),
                  c: "text-[var(--ok)]",
                  unit: PRIZE.code,
                },
                { k: "Chests created", v: String(rows.length), c: "text-[var(--text)]" },
              ].map((cell, i) => (
                <div
                  key={cell.k}
                  className={`py-7 ${i ? "border-[var(--line)] sm:border-l sm:pl-7" : ""}`}
                >
                  <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]">
                    {cell.k}
                  </p>
                  <p
                    className={`mt-3 font-mono text-[clamp(28px,4vw,36px)] font-medium tracking-[-0.03em] ${cell.c}`}
                  >
                    {cell.v}
                    {cell.unit && (
                      <span className="ml-2 text-[18px] text-[var(--gold)]">{cell.unit}</span>
                    )}
                  </p>
                </div>
              ))}
            </section>

            {notice && (
              <p
                className={`mt-6 text-[14px] ${notice.tone === "ok" ? "text-[var(--ok)]" : "text-[var(--red)]"}`}
                role="alert"
              >
                {notice.text}
                {notice.hash && (
                  <>
                    {" "}
                    <a
                      href={`https://stellar.expert/explorer/${process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "public" : "testnet"}/tx/${notice.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      View transaction ↗
                    </a>
                  </>
                )}
              </p>
            )}

            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                    <th className="py-3 font-normal">ID</th>
                    <th className="py-3 font-normal">Chest</th>
                    <th className="py-3 font-normal">Status</th>
                    <th className="py-3 text-right font-normal">Reward</th>
                    <th className="py-3 pl-6 font-normal">Claims</th>
                    <th className="py-3" aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-b border-[var(--line)]">
                      <td className="py-4">
                        <Mono className="text-[var(--dim)]">{r.code}</Mono>
                      </td>
                      <td className="max-w-[320px] py-4 pr-4">
                        <p className="text-[15px] font-medium">{r.name}</p>
                        <p className="truncate text-[13px] text-[var(--dim)]">{r.question}</p>
                      </td>
                      <td className="py-4">
                        <StatusLabel status={r.status} />
                      </td>
                      <td className="py-4 text-right font-mono text-[14px] text-[var(--gold)]">
                        {r.prizeLabel}
                      </td>
                      <td className="py-4 pl-6 font-mono text-[13px]">
                        {r.claims} / {r.maxClaims}
                      </td>
                      <td className="py-4 text-right whitespace-nowrap">
                        {!r.closed && (r.address || r.status === "expired") && (
                          <button
                            type="button"
                            disabled={closing !== null}
                            onClick={() => void closeAndRefund(r)}
                            className="btn-landing btn-landing-p btn-landing-sm mr-2 disabled:opacity-40"
                          >
                            {closing === r.code ? "Closing…" : "Close & refund"}
                          </button>
                        )}
                        <Link href={r.href} className="btn-landing btn-landing-s btn-landing-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
