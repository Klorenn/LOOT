"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LogoChest } from "@/components/logo-chest";
import { PageHeader, Em } from "@/components/page-header";
import { StateBlock } from "@/components/state-block";
import { StatusLabel } from "@/components/status-label";
import { DifficultyBars } from "@/components/difficulty-bars";
import { Mono } from "@/components/kv";
import type { ChestRowData, ChestStatus } from "@/lib/listing";
import { groupSetRows } from "@/lib/chest-set";
import { encodeChestId } from "@/lib/chest-code";
import { stroopsToXlm, tokenDecimals, tokenLabel } from "@/lib/config";
import { useNet } from "@/components/network-provider";

type Filter = "all" | ChestStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "claimed", label: "Claimed" },
  { key: "expired", label: "Expired" },
];

export function ExploreClient({ rows, error }: { rows: ChestRowData[]; error: boolean }) {
  const { NETWORK_LC } = useNet();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // A chest set is ONE card (not one per question); ordinary chests are unchanged.
  const items = useMemo(() => groupSetRows(rows), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const status = it.kind === "set" ? it.status : it.row.status;
      const hay =
        it.kind === "set"
          ? `${it.title} ${it.rows.map((r) => r.question).join(" ")} ${encodeChestId(it.setId)}`
          : `${it.row.name} ${it.row.question} ${it.row.code} ${it.row.id}`;
      return (filter === "all" || status === filter) && (!needle || hay.toLowerCase().includes(needle));
    });
  }, [items, q, filter]);

  const open = items.filter((it) => (it.kind === "set" ? it.status : it.row.status) === "open").length;

  return (
    <main>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
            {error ? `Stellar ${NETWORK_LC}` : `${open} open ${open === 1 ? "chest" : "chests"} · Stellar ${NETWORK_LC}`}
          </span>
        }
        title={
          <>
            Explore <Em>chests</Em>
          </>
        }
        lead="Pick a puzzle, solve it in your browser, and claim the prize with a proof sealed to your address."
        right={<LogoChest className="w-[200px]" />}
      />

      <div className="mx-auto max-w-[1200px] px-6 py-12">
        {error ? (
          <StateBlock
            tone="gold"
            label="Chain read failed"
            title="We couldn’t read the chests."
            body={`The Stellar ${NETWORK_LC} RPC didn’t answer. Nothing is wrong with your account; reload in a moment.`}
            chest="none"
            actions={[{ href: "/explore", label: "Reload", primary: true }]}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chests…"
                aria-label="Search chests"
                className="h-11 w-full max-w-[340px] rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3.5 text-[15px] outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)]"
              />
              <div
                role="group"
                aria-label="Status filter"
                className="inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={`h-[42px] border-l border-[var(--line)] px-4 font-mono text-[13px] first:border-l-0 ${
                      filter === f.key
                        ? "bg-[var(--s2)] text-[var(--text)]"
                        : "text-[var(--dim)] hover:text-[var(--text)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="mt-10">
                {rows.length === 0 ? (
                  <StateBlock
                    tone="dim"
                    label="Empty"
                    title="No chests are listed yet."
                    body="Be the first to hide a prize."
                    chest="closed"
                    actions={[{ href: "/create", label: "Create a chest", primary: true }]}
                  />
                ) : (
                  <StateBlock
                    tone="dim"
                    label="Empty"
                    title="No chests match these filters."
                    body="Try clearing the search or the status filter."
                    chest="closed"
                    actions={[
                      {
                        label: "Clear filters",
                        onClick: () => {
                          setQ("");
                          setFilter("all");
                        },
                        primary: true,
                      },
                      { href: "/create", label: "Create a chest" },
                    ]}
                  />
                )}
              </div>
            ) : (
              <div className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-[var(--line)] font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                      <th className="py-3 font-normal">ID</th>
                      <th className="py-3 font-normal">Chest</th>
                      <th className="py-3 font-normal">Difficulty</th>
                      <th className="py-3 font-normal">Status</th>
                      <th className="py-3 font-normal">Slots</th>
                      <th className="py-3 text-right font-normal">Reward</th>
                      <th className="py-3" aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((it) =>
                      it.kind === "set" ? (
                        <tr
                          key={`set-${it.setId}`}
                          className="group relative border-b border-[var(--line)] hover:bg-[var(--s1)]"
                        >
                          <td className="py-4 font-mono text-[13px] text-[var(--dim)]">SET</td>
                          <td className="max-w-[340px] py-4 pr-4">
                            <Link
                              href={`/set/${encodeChestId(it.setId)}`}
                              className="text-[15px] font-medium after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-[var(--proof)]"
                            >
                              {it.title}
                            </Link>
                            <p className="truncate text-[13px] text-[var(--dim)]">
                              Set of {it.rows.length} {it.rows.length === 1 ? "question" : "questions"}, one prize each
                            </p>
                          </td>
                          <td className="py-4">
                            <span className="font-mono text-[13px] text-[var(--dim)]">—</span>
                          </td>
                          <td className="py-4">
                            <StatusLabel status={it.status} />
                          </td>
                          <td className="py-4 font-mono text-[13px]">
                            {it.openCount} / {it.rows.length} open
                          </td>
                          <td className="py-4 text-right font-mono text-[14px] text-[var(--gold)]">
                            {it.totalStroops
                              ? `${stroopsToXlm(it.totalStroops, tokenDecimals(it.token))} ${tokenLabel(it.token)} total`
                              : "—"}
                          </td>
                          <td className="py-4 pl-6 text-right">
                            <span
                              className={`btn-landing btn-landing-sm ${
                                it.status === "open" ? "btn-landing-p" : "btn-landing-s"
                              }`}
                            >
                              {it.status === "open" ? "Open set" : "View"}
                            </span>
                          </td>
                        </tr>
                      ) : (
                      <ChestTableRow key={it.row.id} r={it.row} />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ChestTableRow({ r }: { r: ChestRowData }) {
  return (
    <tr className="group relative border-b border-[var(--line)] hover:bg-[var(--s1)]">
      <td className="py-4 font-mono text-[13px] text-[var(--dim)]">
        <Mono className="text-[var(--dim)]">{r.code}</Mono>
      </td>
      <td className="max-w-[340px] py-4 pr-4">
        {/* el link cubre toda la fila (after:absolute inset-0) */}
        <Link
          href={r.href}
          className="text-[15px] font-medium after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-[var(--proof)]"
        >
          {r.name}
        </Link>
        <p className="truncate text-[13px] text-[var(--dim)]">{r.question}</p>
      </td>
      <td className="py-4">
        {r.difficulty ? (
          <DifficultyBars level={r.difficulty} />
        ) : (
          <span className="font-mono text-[13px] text-[var(--dim)]">—</span>
        )}
      </td>
      <td className="py-4">
        <StatusLabel status={r.status} />
      </td>
      <td className="py-4 font-mono text-[13px]">
        {r.claims} / {r.maxClaims}
      </td>
      <td className="py-4 text-right font-mono text-[14px] text-[var(--gold)]">{r.prizeLabel}</td>
      <td className="py-4 pl-6 text-right">
        <span className={`btn-landing btn-landing-sm ${r.status === "open" ? "btn-landing-p" : "btn-landing-s"}`}>
          {r.status === "open" ? "Solve" : "View"}
        </span>
      </td>
    </tr>
  );
}
