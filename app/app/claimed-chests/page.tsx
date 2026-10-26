"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CellsCanvas } from "@/components/cells-canvas";
import { LogoChest } from "@/components/logo-chest";
import { StateBlock } from "@/components/state-block";
import { Mono } from "@/components/kv";
import { readWonChests, type WonChestsResult } from "@/lib/chain";
import { chestPath } from "@/lib/chest-code";
import { stroopsToXlm, tokenDecimals, tokenLabel } from "@/lib/config";
import { getChest } from "@/lib/chests-demo";
import { expertTx, shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useNet } from "@/components/network-provider";

type Load = { s: "loading" } | { s: "ok"; v: WonChestsResult } | { s: "error"; msg: string };

const stamp = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;

export default function ClaimedChestsPage() {
  const { CONTRACTS, NETWORK_LC, NETWORK, IS_MAINNET } = useNet();
  const { address } = useSession();
  const [data, setData] = useState<Load>({ s: "loading" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!address) return;
    const mine = ++seq.current;
    setData({ s: "loading" });
    try {
      const v = await readWonChests(address);
      if (mine === seq.current) setData({ s: "ok", v });
    } catch (e) {
      if (mine === seq.current)
        setData({ s: "error", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }, [address]);

  useEffect(() => {
    void load();
    // tras un claim recién hecho, el indexador del RPC tarda un par de ledgers
    const onClaim = () => {
      void load();
      setTimeout(() => void load(), 6000);
    };
    window.addEventListener("chestzk:claimed", onClaim);
    return () => window.removeEventListener("chestzk:claimed", onClaim);
  }, [load]);

  if (!address) return null;
  const items = data.s === "ok" ? data.v.items : [];
  const xlm = items
    .filter((i) => i.token === CONTRACTS.token)
    .reduce((a, i) => a + i.prize, BigInt(0));

  return (
    <main>
      <header className="relative border-b border-[var(--line)]">
        <div className="absolute inset-0 overflow-hidden opacity-50" aria-hidden>
          <CellsCanvas cx={0.9} tint="75,227,160" />
        </div>
        <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-[72px] pb-14">
          <p className="font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">
            Account · {shortAddr(address)}
          </p>
          <h1 className="mt-4 text-[clamp(40px,6vw,64px)] leading-[1] font-semibold tracking-[-0.04em]">
            My claimed <em className="not-italic text-[var(--ok)]">chests</em>
          </h1>
          <p className="mt-5 max-w-[640px] text-[18px] leading-[1.55] text-[var(--muted)]">
            Every chest you opened with a valid proof. Each proof paid the address it was made for and
            can’t be replayed.
          </p>
        </div>
        <LogoChest
          className="pointer-events-none absolute right-[8%] -bottom-14 hidden w-[180px] lg:block"
          deg={30}
          showInside
        />
      </header>

      <div className="mx-auto max-w-[1200px] px-6 py-14">
        {data.s === "loading" ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-[10px] bg-[var(--s1)] opacity-60" />
            ))}
          </div>
        ) : data.s === "error" ? (
          <StateBlock
            tone="gold"
            label="History unavailable"
            title="We couldn’t read your claims."
            body={`The ${NETWORK_LC} RPC didn’t answer (${data.msg.slice(0, 120)}). Nothing was lost; try again.`}
            chest="none"
            actions={[{ label: "Retry", onClick: () => void load(), primary: true }]}
          />
        ) : items.length === 0 ? (
          <StateBlock
            tone="dim"
            label="No claims yet"
            title="Your chests are still locked."
            body="Only claims from the last ~7 days appear here (event window). Solve a chest and it shows up in a few seconds."
            chest="closed"
            actions={[
              { href: "/explore", label: "Explore chests →", primary: true },
              { href: "/#security", label: "See why proofs can’t be stolen" },
            ]}
          />
        ) : (
          <>
            <p className="font-mono text-[13px]">
              {items.length} {items.length === 1 ? "chest" : "chests"}
              {xlm > BigInt(0) && (
                <>
                  {" "}
                  · <span className="text-[var(--gold)]">{stroopsToXlm(xlm)} XLM</span> total
                </>
              )}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-y border-[var(--line)] font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                    <th className="w-16 py-3" aria-label="Chest" />
                    <th className="py-3 font-normal">ID</th>
                    <th className="py-3 font-normal">Chest</th>
                    <th className="py-3 text-right font-normal">Reward</th>
                    <th className="py-3 pl-6 font-normal">Claimed</th>
                    <th className="py-3 font-normal">Tx hash</th>
                    <th className="py-3 font-normal" aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((w) => {
                    const cat = getChest(w.chestId, IS_MAINNET);
                    return (
                      <tr key={`${w.txHash}-${w.chestId}`} className="border-b border-[var(--line)]">
                        <td className="py-4">
                          <LogoChest className="w-[44px]" deg={30} showInside />
                        </td>
                        <td className="py-4 font-mono text-[13px] text-[var(--dim)]">
                          #{String(w.chestId).padStart(4, "0")}
                        </td>
                        <td className="py-4">
                          <p className="text-[15px] font-medium">
                            {cat?.live ? cat.name : `Chest #${w.chestId}`}
                          </p>
                          <p className="flex items-center gap-2 font-mono text-[12px] text-[var(--ok)]">
                            <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
                            claimed by you
                          </p>
                        </td>
                        <td className="py-4 text-right font-mono text-[14px] text-[var(--gold)]">
                          {stroopsToXlm(w.prize, tokenDecimals(w.token))}{" "}
                          {w.token ? tokenLabel(w.token) : ""}
                        </td>
                        <td className="py-4 pl-6 font-mono text-[13px]">{stamp(w.closedAt)}</td>
                        <td className="py-4">
                          <a
                            href={expertTx(NETWORK.explorerUrl, w.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[13px] text-[var(--proof)] hover:underline"
                          >
                            <Mono className="text-[var(--proof)]">{w.txHash}</Mono> ↗
                          </a>
                        </td>
                        <td className="py-4 text-right">
                          <Link href={chestPath(w.chestId)} className="btn-landing btn-landing-s btn-landing-sm">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] text-[var(--dim)]">
              Read from on-chain <code>claimed</code> events (last ~7 days
              {data.s === "ok" && data.v.truncated ? "; the list was cut, more events exist" : ""}).
              Tx links open stellar.expert ({NETWORK_LC}).
            </p>
          </>
        )}
      </div>
    </main>
  );
}
