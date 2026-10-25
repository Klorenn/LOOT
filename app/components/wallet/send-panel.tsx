"use client";

import { useEffect, useMemo, useState } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { KV, Mono } from "@/components/kv";
import { CopyButton } from "@/components/copy-button";
import { PRIZE, stroopsToXlm } from "@/lib/config";
import { expertTx, shortAddr } from "@/lib/format";
import {
  parseDestination,
  parseXlmAmount,
  planSend,
  SendError,
  sendXlm,
  validateMemo,
  type Destination,
  type MemoInput,
  type Plan,
} from "@/lib/send";
import type { Player } from "@/lib/wallet";

type Stage = "form" | "review" | "signing" | "pending" | "done";
type Bal = { balance: bigint; max: bigint; reserve: bigint } | null;

/** Texto llano para los fallos habituales (Horizon, wallet, WebAuthn, relayer). */
function plainError(e: unknown): string {
  if (e instanceof SendError) return e.message;
  const any = e as {
    name?: string;
    message?: string;
    response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } };
  };
  const rc = any?.response?.data?.extras?.result_codes;
  const code = rc?.operations?.[0] ?? rc?.transaction;
  if (code) {
    if (/underfunded|insufficient/i.test(code)) return "Insufficient balance (after the minimum reserve).";
    if (/no_destination/i.test(code)) return "The destination account doesn’t exist yet.";
    if (/no_trust/i.test(code)) return "The destination can’t receive this asset (missing trustline).";
    if (/low_reserve/i.test(code)) return "That amount is below the minimum balance a new account needs (1 XLM).";
    if (/bad_seq/i.test(code)) return "The account changed while you were reviewing. Try again.";
    return `The network rejected the payment (${code}).`;
  }
  const msg = any?.message ?? String(e);
  if (/NotAllowedError|AbortError|WebAuthn authentication failed|ceremony|timed out or was not allowed|cancel|declin|reject|denied|closed|User did not/i.test(`${any?.name} ${msg}`))
    return "Signature rejected. Nothing was sent.";
  if (/Error\(Contract, #10\)|underfunded|balance/i.test(msg)) return "Insufficient balance.";
  if (/AccountMissing|does not exist/i.test(msg))
    return "The destination account doesn’t exist yet. A transfer can’t create accounts.";
  if (/passkey submit|relay|HTTP 5|fetch failed|network|timeout/i.test(msg))
    return "The relayer or network didn’t confirm the payment. Nothing was sent; try again in a moment.";
  return msg.slice(0, 200);
}

export function SendPanel({
  player,
  bal,
  onSent,
}: {
  player: Player;
  bal: Bal;
  onSent: () => void;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [destText, setDestText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [memoType, setMemoType] = useState<MemoInput["type"]>("none");
  const [memoText, setMemoText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ plan: Plan; dest: Destination; amount: bigint; memo: MemoInput } | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const isPasskey = player.kind === "passkey";
  const parsedDest = useMemo(() => (destText.trim() ? parseDestination(destText) : null), [destText]);
  const destErr = parsedDest && "error" in parsedDest ? parsedDest.error : null;
  const memo: MemoInput = useMemo(
    () => (memoType === "none" ? { type: "none" } : ({ type: memoType, value: memoText } as MemoInput)),
    [memoType, memoText],
  );

  // En passkey solo existe el memo ID (vía M…): se vuelve a "None" si había otro.
  useEffect(() => {
    if (isPasskey && (memoType === "text" || memoType === "hash")) setMemoType("none");
  }, [isPasskey, memoType]);

  async function review() {
    setError(null);
    if (!parsedDest || "error" in parsedDest) return setError(destErr ?? "Enter a destination address.");
    const amount = parseXlmAmount(amountText);
    if (amount === null) return setError("Enter an amount above 0 with at most 7 decimals.");
    const memoErr = validateMemo(memo, parsedDest);
    if (memoErr) return setError(memoErr);
    setChecking(true);
    try {
      const p = await planSend(player, parsedDest, amount, memo);
      setPlan({ plan: p, dest: parsedDest, amount, memo });
      setStage("review");
    } catch (e) {
      setError(plainError(e));
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!plan) return;
    setError(null);
    setStage("signing");
    try {
      const r = await sendXlm(player, plan.dest, plan.amount, plan.memo, (ph) => setStage(ph));
      setHash(r.hash);
      setStage("done");
      onSent();
    } catch (e) {
      setError(plainError(e));
      setStage("review");
    }
  }

  function reset() {
    setStage("form");
    setPlan(null);
    setHash(null);
    setError(null);
    setDestText("");
    setAmountText("");
    setMemoType("none");
    setMemoText("");
  }

  const memoLabel =
    plan?.memo.type === "text"
      ? `Text · ${plan.memo.value}`
      : plan?.memo.type === "id"
        ? `ID · ${plan.memo.value}`
        : plan?.memo.type === "hash"
          ? `Hash · ${shortAddr(plan.memo.value, 8)}`
          : plan?.dest.kind === "M"
            ? `Embedded in the M… address (id ${plan.dest.muxId})`
            : "None";

  const busy = stage === "signing" || stage === "pending";
  const input =
    "mt-2 h-11 w-full rounded-[10px] border bg-[var(--bg)] px-3.5 outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)]";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6">
        {stage === "done" && hash ? (
          <div className="space-y-5">
            <InlineAlert
              tone="ok"
              title="Sent"
              body={`${stroopsToXlm(plan!.amount)} ${PRIZE.code} sent to ${shortAddr(plan!.dest.input, 6)}.`}
            />
            <KV
              rows={[
                { label: "Amount", value: `${stroopsToXlm(plan!.amount)} ${PRIZE.code}`, valueClass: "text-[var(--gold)]" },
                { label: "To", value: <Mono>{plan!.dest.input}</Mono> },
                { label: "Memo", value: memoLabel },
                { label: "Tx hash", value: <Mono>{hash}</Mono> },
              ]}
            />
            <div className="flex flex-wrap gap-3">
              <a href={expertTx(hash)} target="_blank" rel="noreferrer" className="btn-landing btn-landing-p">
                View on Stellar Expert ↗
              </a>
              <CopyButton value={hash} label="Copy hash" className="btn-landing btn-landing-s" />
              <button type="button" onClick={reset} className="btn-landing btn-landing-s">
                Send another
              </button>
            </div>
          </div>
        ) : stage === "form" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void review();
            }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="dest" className="block text-[14px] font-medium">
                Destination
              </label>
              <input
                id="dest"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                placeholder="G… or M… address"
                autoComplete="off"
                spellCheck={false}
                className={`${input} font-mono text-[13px] ${destErr ? "border-[var(--red)]" : "border-[var(--line)]"}`}
              />
              <p className={`mt-2 text-[13px] ${destErr ? "text-[var(--red)]" : "text-[var(--dim)]"}`}>
                {destErr ??
                  (parsedDest && !("error" in parsedDest) && parsedDest.kind === "M"
                    ? `Muxed address: pays ${shortAddr(parsedDest.baseG!, 6)} with id ${parsedDest.muxId}.`
                    : "Any funded testnet account.")}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="amount" className="block text-[14px] font-medium">
                  Amount (XLM)
                </label>
                {bal && (
                  <button
                    type="button"
                    onClick={() => setAmountText(stroopsToXlm(bal.max))}
                    className="font-mono text-[12px] text-[var(--proof)] underline underline-offset-2"
                  >
                    Max {stroopsToXlm(bal.max)}
                  </button>
                )}
              </div>
              <input
                id="amount"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.0"
                autoComplete="off"
                className={`${input} border-[var(--line)] font-mono text-[15px]`}
              />
              <p className="mt-2 text-[13px] text-[var(--dim)]">
                {bal ? `Available: ${stroopsToXlm(bal.balance)} ${PRIZE.code}. ` : ""}
                {isPasskey
                  ? "Max is your full balance: the relayer pays the network fee."
                  : "Max keeps the account’s minimum reserve and a small fee buffer."}
              </p>
            </div>

            <fieldset>
              <legend className="text-[14px] font-medium">Memo</legend>
              <div role="group" aria-label="Memo type" className="mt-2 inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]">
                {(["none", "text", "id", "hash"] as const).map((t) => {
                  const off = isPasskey && (t === "text" || t === "hash");
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={off}
                      aria-pressed={memoType === t}
                      title={off ? "Smart account: ID memos only. Text/Hash need a G wallet" : undefined}
                      onClick={() => setMemoType(t)}
                      className={`h-10 border-l border-[var(--line)] px-4 font-mono text-[13px] first:border-l-0 disabled:opacity-40 ${
                        memoType === t ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--dim)] hover:text-[var(--text)]"
                      }`}
                    >
                      {t === "none" ? "None" : t === "text" ? "Text" : t === "id" ? "ID" : "Hash"}
                    </button>
                  );
                })}
              </div>
              {memoType !== "none" && (
                <input
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  aria-label="Memo value"
                  placeholder={
                    memoType === "text" ? "Up to 28 bytes" : memoType === "id" ? "Whole number" : "64 hex characters"
                  }
                  autoComplete="off"
                  className={`${input} border-[var(--line)] font-mono text-[14px]`}
                />
              )}
              <p className="mt-2 text-[13px] text-[var(--dim)]">
                {isPasskey
                  ? "Smart account: ID memos only (sent inside an M… address). Text and hash memos need a G… wallet."
                  : "Most exchanges require a memo: check their deposit instructions."}
              </p>
            </fieldset>

            {error && <InlineAlert tone="red" title="Can’t send yet" body={error} />}

            <button type="submit" disabled={checking} className="btn-landing btn-landing-p w-full disabled:opacity-50">
              {checking ? "Checking…" : "Review"}
            </button>
          </form>
        ) : (
          plan && (
            <div className="space-y-5">
              <KV
                rows={[
                  { label: "From", value: <Mono>{player.publicKey}</Mono> },
                  { label: "To", value: <Mono>{plan.dest.input}</Mono> },
                  { label: "Amount", value: `${stroopsToXlm(plan.amount)} ${PRIZE.code}`, valueClass: "text-[var(--gold)]" },
                  { label: "Memo", value: memoLabel },
                  { label: "Network", value: "Stellar testnet" },
                  { label: "Fee", value: plan.plan.feeNote },
                ]}
              />
              {plan.plan.notes.map((n) => (
                <InlineAlert key={n} tone="gold" title="Note" body={n} />
              ))}
              {stage === "signing" && (
                <InlineAlert
                  tone="proof"
                  title="Signing"
                  body={isPasskey ? "Confirm with your passkey…" : "Confirm in your wallet…"}
                />
              )}
              {stage === "pending" && (
                <InlineAlert tone="proof" title="Pending" body="Submitted. Waiting for the ledger to confirm (about 5 seconds)…" />
              )}
              {error && <InlineAlert tone="red" title="Not sent" body={error} />}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className="btn-landing btn-landing-p disabled:opacity-50"
                >
                  {busy ? "Working…" : "Confirm and send"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStage("form");
                    setError(null);
                  }}
                  className="btn-landing btn-landing-s"
                >
                  Back
                </button>
              </div>
            </div>
          )
        )}
      </section>

      <aside className="h-fit rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6">
        <h3 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">Before you send</h3>
        <dl className="mt-4 space-y-3 text-[14px]">
          {[
            ["Network", "Stellar testnet (no real funds)"],
            ["From", shortAddr(player.publicKey, 6)],
            [
              "Fee",
              isPasskey ? "≈ 0.00001 XLM · paid by the Loot relayer" : "≈ 0.00001 XLM · paid from your account",
            ],
            [
              "Min. reserve",
              isPasskey
                ? "None to keep: it’s a smart account"
                : bal
                  ? `${stroopsToXlm(bal.reserve)} XLM stays in the account`
                  : "0.5 XLM per account entry",
            ],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[96px_1fr] gap-3">
              <dt className="font-mono text-[12px] text-[var(--dim)] uppercase">{k}</dt>
              <dd className="text-[var(--muted)]">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
