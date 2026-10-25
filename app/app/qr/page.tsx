"use client";

import { useEffect, useMemo, useState } from "react";
import { CellsCanvas } from "@/components/cells-canvas";
import { CopyField } from "@/components/copy-field";
import { QrTile, downloadQrPng } from "@/components/qr-tile";
import { ExampleTag } from "@/components/example-tag";
import { DEMO_CHEST } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

const HANDOFF_MS = 5 * 60 * 1000;

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default function QrPage() {
  const { address } = useSession();
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [expires, setExpires] = useState(0);
  const [now, setNow] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCode(newCode());
    setExpires(Date.now() + HANDOFF_MS);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const chestNo = String(DEMO_CHEST.id).padStart(4, "0");
  const invite = origin ? `${origin}/chest/${DEMO_CHEST.id}` : "";
  const handoff = origin && code ? `${origin}/chest/${DEMO_CHEST.id}?handoff=${code}` : "";
  const left = Math.max(0, expires - now);
  const mmss = useMemo(
    () =>
      `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`,
    [left],
  );

  async function share() {
    setShareMsg(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Loot chest", text: DEMO_CHEST.question, url: invite });
        return;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(invite);
      setShareMsg("Link copied");
    } catch {
      setShareMsg("Copy the link from the field above");
    }
  }

  if (!address) return null;

  return (
    <main>
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
          <CellsCanvas cx={0.9} />
        </div>
        <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-[72px] pb-14">
          <p className="font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">Receive / share</p>
          <h1 className="mt-4 text-[clamp(40px,6vw,64px)] leading-[1] font-semibold tracking-[-0.04em]">
            Scan to <em className="not-italic text-[var(--proof)]">open</em>
          </h1>
          <p className="mt-5 max-w-[640px] text-[18px] leading-[1.55] text-[var(--muted)]">
            Share your address to receive XLM, or send a chest invite. Friends scan it with a phone
            camera and land straight on the puzzle.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="grid grid-cols-1 border border-[var(--line)] md:grid-cols-3">
          <section className="p-8">
            <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]">01 · Receive</p>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">Your address</h2>
            <p className="mt-2 text-[14px] leading-[1.5] text-[var(--muted)]">
              {address.startsWith("C") ? "Passkey smart account" : "Stellar account"} on testnet. Send
              only testnet assets.
            </p>
            <div className="mt-6">
              <QrTile value={address} id="qr-address" />
            </div>
            <CopyField value={address} display={shortAddr(address, 8)} className="mt-6" />
            <p className="mt-2 text-[13px] text-[var(--dim)]">
              Encodes the raw {address.startsWith("C") ? "C…" : "G…"} address.
            </p>
          </section>

          <section className="border-t border-[var(--line)] p-8 md:border-t-0 md:border-l">
            <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]">02 · Chest invite</p>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">
              #{chestNo} Who created SCP
            </h2>
            <p className="mt-2 text-[14px] leading-[1.5] text-[var(--muted)]">
              Anyone who scans opens the chest. The prize still goes only to whoever proves the answer.
            </p>
            <div className="mt-6">{invite && <QrTile value={invite} id="qr-invite" />}</div>
            {invite && <CopyField value={invite} className="mt-6" />}
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void downloadQrPng("qr-invite", `loot-chest-${chestNo}.png`)}
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                Download PNG
              </button>
              <button type="button" onClick={() => void share()} className="btn-landing btn-landing-s btn-landing-sm">
                Share link
              </button>
            </div>
            {shareMsg && (
              <p className="mt-2 font-mono text-[12px] text-[var(--dim)]" role="status">
                {shareMsg}
              </p>
            )}
          </section>

          <section className="border-t border-[var(--line)] p-8 md:border-t-0 md:border-l">
            <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)]">03 · Solve on phone</p>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">Continue on mobile</h2>
            <p className="mt-2 text-[14px] leading-[1.5] text-[var(--muted)]">
              Scan to open this chest on your phone and sign with the passkey stored there.
            </p>
            <div className="mt-6">{handoff && <QrTile value={handoff} id="qr-handoff" />}</div>
            <ol className="mt-6">
              {[
                ["Code shown", left > 0 ? "done" : "expired", left > 0 ? "var(--ok)" : "var(--red)"],
                ["Waiting for phone to scan", "—", "var(--dim)"],
                ["Passkey sign on phone", "—", "var(--dim)"],
                ["Prove & claim on phone", "—", "var(--dim)"],
              ].map(([s, st, c], i) => (
                <li
                  key={s}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-[var(--line)] py-3 text-[14px]"
                >
                  <span className="font-mono text-[12px] text-[var(--dim)]">
                    {String.fromCharCode(97 + i)}
                  </span>
                  <span>{s}</span>
                  <span className="font-mono text-[12px]" style={{ color: c }}>
                    {st}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] leading-[1.5] text-[var(--dim)]">
              {left > 0 ? `Hand-off code expires in ${mmss}.` : "Hand-off code expired."} The answer is
              typed on the phone and never crosses devices.
            </p>
            {left === 0 && (
              <button
                type="button"
                onClick={() => {
                  setCode(newCode());
                  setExpires(Date.now() + HANDOFF_MS);
                }}
                className="btn-landing btn-landing-s btn-landing-sm mt-3"
              >
                New code
              </button>
            )}
            <p className="mt-3">
              <ExampleTag>hand-off sync not wired</ExampleTag>
            </p>
          </section>
        </div>
        <p className="mt-4 text-[13px] text-[var(--dim)]">
          All QR codes are real and scannable. The hand-off link just opens this chest on the phone:
          there is no backend yet to sync the steps.
        </p>
      </div>
    </main>
  );
}
