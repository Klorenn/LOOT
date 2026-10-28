"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StateBlock } from "@/components/state-block";
import { StatusLabel } from "@/components/status-label";
import { DifficultyBars } from "@/components/difficulty-bars";
import { Mono } from "@/components/kv";
import { useNet } from "@/components/network-provider";
import { useSession } from "@/lib/session";
import { chestPath } from "@/lib/chest-code";
import { displayId } from "@/lib/registry";
import { chestSaltFragment, parseSetSalts } from "@/lib/chest-set";
import type { SetMemberView } from "@/app/api/sets/[code]/route";

type SetData = {
  id: number;
  title: string;
  creator: string;
  size: number;
  listed: boolean;
  members: SetMemberView[];
  claimedChestId: number | null;
};

type Load = { s: "loading" } | { s: "ok"; v: SetData } | { s: "missing" } | { s: "error" };

export function SetView({ code }: { code: string }) {
  const { NETWORK_LC } = useNet();
  const { player } = useSession();
  const account = player?.publicKey;
  const [data, setData] = useState<Load>({ s: "loading" });
  // Private sets: the salt of each question travels in the link after # (never to a server).
  const [salts, setSalts] = useState<(string | undefined)[]>([]);

  useEffect(() => {
    const read = () => setSalts(parseSetSalts(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    let off = false;
    const q = account ? `?account=${encodeURIComponent(account)}` : "";
    fetch(`/api/sets/${code}${q}`)
      .then(async (r) => {
        if (r.status === 404) return !off && setData({ s: "missing" });
        if (!r.ok) throw new Error(String(r.status));
        const v = (await r.json()) as SetData;
        if (!off) setData({ s: "ok", v });
      })
      .catch(() => !off && setData({ s: "error" }));
    return () => {
      off = true;
    };
  }, [code, account]);

  if (data.s === "missing" || data.s === "error") {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-20">
        <StateBlock
          tone={data.s === "missing" ? "dim" : "gold"}
          label={data.s === "missing" ? "Not found" : "Couldn’t load"}
          title={data.s === "missing" ? "This set doesn’t exist on this network." : "We couldn’t load this set."}
          body={
            data.s === "missing"
              ? "Check the link, or the network selected in the header."
              : "Reload in a moment. Nothing is wrong with your account."
          }
          chest="none"
          actions={[{ href: "/explore", label: "Explore chests", primary: true }]}
        />
      </main>
    );
  }

  const set = data.s === "ok" ? data.v : null;
  const open = set?.members.filter((m) => m.status === "open").length ?? 0;

  return (
    <main>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/explore" className="hover:text-[var(--text)]">
              Explore
            </Link>
            {" · "}Set · Stellar {NETWORK_LC}
          </span>
        }
        title={
          set ? (
            <span className="block text-[clamp(28px,4.4vw,52px)] leading-[1.12] tracking-[-0.03em]">{set.title}</span>
          ) : (
            <span className="block text-[clamp(28px,4.4vw,52px)] leading-[1.12] text-[var(--dim)]">Loading…</span>
          )
        }
        lead={
          set ? (
            <span className="font-mono text-[14px] tracking-[0.06em] text-[var(--dim)]">
              {set.members.length} {set.members.length === 1 ? "question" : "questions"} · {open} open · one prize each
            </span>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-[900px] px-6 py-12">
        {set && (
          <>
            <p className="text-[15px] leading-[1.55] text-[var(--muted)]">
              Each question is its own chest with its own answer and prize. Solve one to claim that chest. Knowing one
              answer doesn&apos;t help with another.
            </p>
            <p className="mt-2 text-[13px] leading-[1.55] text-[var(--dim)]">
              This app lets each account take one chest per set. That rule is enforced by the app only, not on-chain.
            </p>

            {set.claimedChestId !== null && (
              <p className="mt-6 rounded-[10px] border border-[var(--line)] bg-[var(--s1)] px-4 py-3 text-[14px] text-[var(--muted)]" role="status">
                This account already claimed a chest from this set. The other questions are closed to it.
              </p>
            )}

            <ol className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {set.members.map((m) => {
                const mine = set.claimedChestId === m.chestId;
                const blockedForMe = set.claimedChestId !== null && !mine;
                const needsSalt = !set.listed && !salts[m.index];
                return (
                  <li key={m.chestId} className="relative grid grid-cols-[40px_1fr_auto] items-center gap-4 py-5 hover:bg-[var(--s1)]">
                    <span className="pl-1 font-mono text-[13px] text-[var(--dim)]">{String(m.index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <Link
                        href={`${chestPath(m.chestId)}${set.listed ? "" : chestSaltFragment(salts, m.index)}`}
                        className="text-[16px] font-medium after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-[var(--proof)]"
                      >
                        {m.question}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-[var(--dim)]">
                        <span className="text-[var(--gold)]">{m.prizeLabel ?? "—"}</span>
                        {m.difficulty && <DifficultyBars level={m.difficulty} />}
                        <Mono className="text-[var(--dim)]">{`#${String(displayId(m.chestId)).padStart(4, "0")}`}</Mono>
                        {mine && <span className="text-[var(--ok)]">claimed by this account</span>}
                        {blockedForMe && m.status === "open" && <span>not available to this account</span>}
                        {needsSalt && m.status === "open" && <span className="text-[var(--gold)]">needs the full invite link</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {m.status === "unknown" ? (
                        <span className="font-mono text-[13px] text-[var(--dim)]">—</span>
                      ) : (
                        <StatusLabel status={m.status} />
                      )}
                      <span className={`btn-landing btn-landing-sm ${m.status === "open" && !blockedForMe ? "btn-landing-p" : "btn-landing-s"}`}>
                        {m.status === "open" && !blockedForMe ? "Solve" : "View"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            {set.members.length < set.size && (
              <p className="mt-4 text-[13px] text-[var(--dim)]">
                The creator planned {set.size} questions; {set.members.length} {set.members.length === 1 ? "is" : "are"} live so far.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
