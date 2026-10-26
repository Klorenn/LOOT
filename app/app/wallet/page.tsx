"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CellsCanvas } from "@/components/cells-canvas";
import { ActivityList } from "@/components/wallet/activity-list";
import { ReceivePanel } from "@/components/wallet/receive-panel";
import { SendPanel } from "@/components/wallet/send-panel";
import { PRIZE, stroopsToXlm } from "@/lib/config";
import { expertAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { balanceInfo } from "@/lib/send";
import { loadActivity, loadAssets, type ActivityItem, type Asset } from "@/lib/wallet-data";
import { useNet } from "@/components/network-provider";

type Tab = "receive" | "send" | "activity";
const TABS: { key: Tab; label: string }[] = [
  { key: "receive", label: "Receive" },
  { key: "send", label: "Send" },
  { key: "activity", label: "Activity" },
];

function WalletInner() {
  const { NETWORK_LC, NETWORK } = useNet();
  const { player } = useSession();
  const params = useSearchParams();
  const raw = params.get("tab");
  const [tab, setTab] = useState<Tab>(raw === "send" || raw === "activity" ? raw : "receive");

  const [bal, setBal] = useState<Awaited<ReturnType<typeof balanceInfo>> | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [actErr, setActErr] = useState(false);
  const [actLoading, setActLoading] = useState(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!player) return;
    const mine = ++seq.current;
    setActLoading(true);
    setActErr(false);
    // Cada bloque se pinta cuando llega: la actividad de una cuenta C escanea eventos del RPC y
    // puede tardar decenas de segundos; el saldo no debe esperar por ella.
    void balanceInfo(player).then(
      (v) => mine === seq.current && setBal(v),
      () => mine === seq.current && setBal(null),
    );
    void loadAssets(player).then(
      (v) => mine === seq.current && setAssets(v),
      () => mine === seq.current && setAssets(null),
    );
    void loadActivity(player, 20).then(
      (v) => {
        if (mine !== seq.current) return;
        setActivity(v);
        setActLoading(false);
      },
      (e) => {
        console.warn("wallet: activity failed", e);
        if (mine !== seq.current) return;
        setActivity(null);
        setActErr(true);
        setActLoading(false);
      },
    );
  }, [player]);

  useEffect(() => {
    void refresh();
    const onClaim = () => {
      void refresh();
      setTimeout(() => void refresh(), 6000);
    };
    window.addEventListener("chestzk:claimed", onClaim);
    return () => window.removeEventListener("chestzk:claimed", onClaim);
  }, [refresh]);

  // mantiene ?tab= en la URL sin recargar
  function go(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  if (!player) return null;
  const address = player.publicKey;
  const kind =
    player.kind === "passkey" ? "Passkey smart account" : player.kind === "wallet" ? "Stellar wallet" : "Demo wallet";
  const balanceText = bal ? stroopsToXlm(bal.balance) : "—";
  const emptyAct =
    player.kind === "passkey"
      ? "No activity in the last ~7 days (the RPC only keeps recent events). Older history is on Stellar Expert."
      : "No activity yet.";

  const activityCard = (limit: number) => (
    <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
          Recent activity
        </h2>
        <a
          href={expertAddress(NETWORK.explorerUrl, address)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-[var(--proof)] underline underline-offset-2"
        >
          View all on Stellar Expert ↗
        </a>
      </div>
      <div className="mt-3">
        <ActivityList
          items={activity ? activity.slice(0, limit) : null}
          loading={actLoading}
          error={actErr}
          empty={emptyAct}
        />
      </div>
    </section>
  );

  return (
    <main>
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
          <CellsCanvas cx={0.9} />
        </div>
        <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-[72px]">
          <p className="font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">Wallet · {kind}</p>
          <p className="mt-4 font-mono text-[clamp(40px,7vw,64px)] leading-[1] font-medium tracking-[-0.04em]">
            {balanceText}
            <span className="ml-3 text-[clamp(20px,3vw,28px)] text-[var(--gold)]">{PRIZE.code}</span>
          </p>
          <p className="mt-3 text-[15px] text-[var(--muted)]">
            {assets ? `${assets.length} ${assets.length === 1 ? "asset" : "assets"}` : "—"} · Stellar {NETWORK_LC}
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => go("receive")} className="btn-landing btn-landing-s">
              ↓ Receive
            </button>
            <button type="button" onClick={() => go("send")} className="btn-landing btn-landing-p">
              ↑ Send
            </button>
          </div>
          <div role="tablist" aria-label="Wallet sections" className="mt-10 flex gap-8">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => go(t.key)}
                className={`-mb-px border-b-2 py-3 text-[14px] ${
                  tab === t.key
                    ? "border-[var(--proof)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-6 py-10">
        {tab === "receive" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[5fr_7fr]">
            <ReceivePanel address={address} />
            <div className="space-y-6">
              <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6">
                <h2 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">Assets</h2>
                <ul className="mt-3 divide-y divide-[var(--line)]">
                  {(assets ?? []).map((a) => (
                    <li key={a.code} className="flex items-baseline justify-between py-3">
                      <span>
                        <span className="text-[15px] font-medium">{a.code}</span>
                        <span className="ml-2 text-[13px] text-[var(--dim)]">{a.label}</span>
                      </span>
                      <span className="font-mono text-[14px] text-[var(--gold)]">{a.amount}</span>
                    </li>
                  ))}
                  {!assets && <li className="py-3 text-[14px] text-[var(--muted)]">Balances unavailable right now.</li>}
                </ul>
              </section>
              {activityCard(5)}
            </div>
          </div>
        )}

        {tab === "send" && (
          <div className="space-y-6">
            <SendPanel player={player} bal={bal} onSent={() => void refresh()} />
            {activityCard(5)}
          </div>
        )}

        {tab === "activity" && (
          <div className="max-w-[760px]">
            {activityCard(20)}
            <p className="mt-3 text-[13px] text-[var(--dim)]">
              <Link href="/claimed-chests" className="underline underline-offset-2">
                Chests you claimed
              </Link>{" "}
              are listed separately.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletInner />
    </Suspense>
  );
}
