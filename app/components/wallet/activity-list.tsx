"use client";

import { expertTx, shortAddr } from "@/lib/format";
import type { ActivityItem } from "@/lib/wallet-data";

const COLOR: Record<ActivityItem["kind"], string> = {
  Sent: "var(--text)",
  Received: "var(--ok)",
  "Prize claimed": "var(--gold)",
  "Account created": "var(--ok)",
  "Contract call": "var(--muted)",
  Other: "var(--muted)",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

/** Lista de actividad: cada fila enlaza su tx en Stellar Expert. */
export function ActivityList({
  items,
  loading,
  error,
  empty,
}: {
  items: ActivityItem[] | null;
  loading: boolean;
  error: boolean;
  empty: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-[8px] bg-[var(--s2)] opacity-50" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-[14px] text-[var(--muted)]">
        Couldn’t read the activity right now. Try again in a moment.
      </p>
    );
  }
  if (!items || items.length === 0) {
    return <p className="text-[14px] leading-[1.5] text-[var(--muted)]">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium" style={{ color: COLOR[a.kind] }}>
              {a.kind}
              {a.amount && <span className="ml-2 font-mono text-[13px]">{a.amount}</span>}
            </p>
            <p className="font-mono text-[12px] text-[var(--dim)]">
              {fmt(a.at)}
              {a.counterparty && ` · ${a.kind === "Received" || a.kind === "Account created" ? "from" : "to"} ${shortAddr(a.counterparty, 4)}`}
            </p>
          </div>
          <a
            href={expertTx(a.hash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-[var(--proof)] underline underline-offset-2"
          >
            tx ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
