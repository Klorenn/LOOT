"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, Em } from "@/components/page-header";
import { InlineAlert } from "@/components/inline-alert";
import { KV, Mono } from "@/components/kv";
import { PRIZE, stroopsToXlm } from "@/lib/config";
import { expertTx, shortAddr } from "@/lib/format";
import {
  balanceInfo,
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
import { useSession } from "@/lib/session";

type Stage = "form" | "review" | "sending" | "done";

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
    if (/low_reserve/i.test(code)) return "That amount is below the minimum balance a new account needs (1 XLM).";
    if (/bad_seq/i.test(code)) return "The account changed while you were reviewing. Try again.";
    return `The network rejected the payment (${code}).`;
  }
  const msg = any?.message ?? String(e);
  if (/NotAllowedError|AbortError|cancel|declin|reject|denied|closed/i.test(`${any?.name} ${msg}`))
    return "You cancelled the request. Nothing was sent.";
  if (/Error\(Contract, #10\)|underfunded|balance/i.test(msg)) return "Insufficient balance.";
  if (/AccountMissing|does not exist|missing/i.test(msg))
    return "The destination account doesn’t exist yet. A transfer can’t create accounts.";
  if (/passkey submit|relay|HTTP 5|fetch failed|network/i.test(msg))
    return "The relayer or network didn’t confirm the payment. Nothing was sent; try again in a moment.";
  return msg.slice(0, 200);
}

export default function SendPage() {
  const { player } = useSession();
  const [stage, setStage] = useState<Stage>("form");
  const [destText, setDestText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [memoType, setMemoType] = useState<MemoInput["type"]>("none");
  const [memoText, setMemoText] = useState("");
  const [bal, setBal] = useState<{ balance: bigint; max: bigint } | null>(null);
  const [balErr, setBalErr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ plan: Plan; dest: Destination; amount: bigint; memo: MemoInput } | null>(
    null,
  );
  const [hash, setHash] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const loadBalance = useCallback(async () => {
    if (!player) return;
    setBalErr(false);
    try {
      setBal(await balanceInfo(player));
    } catch {
      setBalErr(true);
    }
  }, [player]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const isPasskey = player?.kind === "passkey";
  const parsedDest = useMemo(() => (destText.trim() ? parseDestination(destText) : null), [destText]);
  const destErr = parsedDest && "error" in parsedDest ? parsedDest.error : null;
  const memo: MemoInput = useMemo(
    () =>
      memoType === "none"
        ? { type: "none" }
        : ({ type: memoType, value: memoText } as MemoInput),
    [memoType, memoText],
  );

  if (!player) return null;

  async function review() {
    setError(null);
    if (!parsedDest || "error" in parsedDest) return setError(destErr ?? "Enter a destination address.");
    const amount = parseXlmAmount(amountText);
    if (amount === null) return setError("Enter an amount above 0 with at most 7 decimals.");
    const memoErr = validateMemo(memo, parsedDest);
    if (memoErr) return setError(memoErr);
    setChecking(true);
    try {
      const p = await planSend(player!, parsedDest, amount, memo);
      setPlan({ plan: p, dest: parsedDest, amount, memo });
      setStage("review");
    } catch (e) {
      console.warn("send: review failed", e);
      setError(plainError(e));
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!plan) return;
    setError(null);
    setStage("sending");
    try {
      const r = await sendXlm(player!, plan.dest, plan.amount, plan.memo);
      setHash(r.hash);
      setStage("done");
      window.dispatchEvent(new Event("chestzk:claimed")); // refresca saldos abiertos
      void loadBalance();
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
        : plan?.dest.kind === "M"
          ? `Embedded in the M… address (id ${plan.dest.muxId})`
          : "None";

  return (
    <main>
      <PageHeader
        eyebrow={<span>Send</span>}
        title={
          <>
            Send <Em>XLM</Em>
          </>
        }
        lead="Send XLM from this account to any Stellar testnet address. You’ll review everything before it goes out."
      />

      <div className="mx-auto max-w-[640px] px-6 py-12">
        {stage === "done" && hash ? (
          <div className="space-y-5">
            <InlineAlert
              tone="ok"
              title="Sent"
              body={`${stroopsToXlm(plan!.amount)} ${PRIZE.code} sent to ${shortAddr(plan!.dest.input, 6)}.`}
            />
            <KV
              rows={[
                { label: "Tx hash", value: <Mono>{hash}</Mono> },
                { label: "Balance", value: bal ? `${stroopsToXlm(bal.balance)} ${PRIZE.code}` : "—" },
              ]}
            />
            <div className="flex flex-wrap gap-3">
              <a
                href={expertTx(hash)}
                target="_blank"
                rel="noreferrer"
                className="btn-landing btn-landing-p"
              >
                View on Stellar Expert ↗
              </a>
              <button type="button" onClick={reset} className="btn-landing btn-landing-s">
                Send another
              </button>
              <Link href="/profile" className="btn-landing btn-landing-s">
                Back to profile
              </Link>
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
            <p className="font-mono text-[12px] text-[var(--dim)]">
              From {shortAddr(player.publicKey, 6)} · balance{" "}
              {bal ? `${stroopsToXlm(bal.balance)} ${PRIZE.code}` : balErr ? "unavailable" : "…"}
            </p>

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
                className={`mt-2 h-11 w-full rounded-[10px] border bg-[var(--bg)] px-3.5 font-mono text-[13px] outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)] ${
                  destErr ? "border-[var(--red)]" : "border-[var(--line)]"
                }`}
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
                className="mt-2 h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3.5 font-mono text-[15px] outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)]"
              />
              <p className="mt-2 text-[13px] text-[var(--dim)]">
                {isPasskey
                  ? "Max is your full balance: the relayer pays the network fee."
                  : "Max keeps the account’s minimum reserve and a small fee buffer."}
              </p>
            </div>

            <fieldset>
              <legend className="text-[14px] font-medium">Memo</legend>
              <div
                role="group"
                aria-label="Memo type"
                className="mt-2 inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]"
              >
                {(["none", "text", "id"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={memoType === t}
                    onClick={() => setMemoType(t)}
                    className={`h-10 border-l border-[var(--line)] px-4 font-mono text-[13px] first:border-l-0 ${
                      memoType === t
                        ? "bg-[var(--s2)] text-[var(--text)]"
                        : "text-[var(--dim)] hover:text-[var(--text)]"
                    }`}
                  >
                    {t === "none" ? "None" : t === "text" ? "Text" : "ID"}
                  </button>
                ))}
              </div>
              {memoType !== "none" && (
                <input
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  aria-label="Memo value"
                  placeholder={memoType === "text" ? "Up to 28 bytes" : "Whole number"}
                  autoComplete="off"
                  className="mt-3 h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3.5 font-mono text-[14px] outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)]"
                />
              )}
              {isPasskey && memoType === "text" && (
                <p className="mt-2 text-[13px] text-[var(--gold)]">
                  Memos aren’t supported from a passkey wallet. For exchanges that require a memo, use an
                  M… address.
                </p>
              )}
              {isPasskey && memoType === "id" && (
                <p className="mt-2 text-[13px] text-[var(--dim)]">
                  The ID is sent inside an M… address built from the G… destination.
                </p>
              )}
            </fieldset>

            {error && <InlineAlert tone="red" title="Can’t send yet" body={error} />}

            <button
              type="submit"
              disabled={checking}
              className="btn-landing btn-landing-p w-full disabled:opacity-50"
            >
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
                  {
                    label: "Amount",
                    value: `${stroopsToXlm(plan.amount)} ${PRIZE.code}`,
                    valueClass: "text-[var(--gold)]",
                  },
                  { label: "Memo", value: memoLabel },
                  { label: "Network", value: "Stellar testnet" },
                  { label: "Fee", value: plan.plan.feeNote },
                ]}
              />
              {plan.plan.notes.map((n) => (
                <InlineAlert key={n} tone="gold" title="Note" body={n} />
              ))}
              {error && <InlineAlert tone="red" title="Not sent" body={error} />}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={stage === "sending"}
                  className="btn-landing btn-landing-p disabled:opacity-50"
                >
                  {stage === "sending"
                    ? isPasskey
                      ? "Confirm with your passkey…"
                      : "Confirm in your wallet…"
                    : "Confirm and send"}
                </button>
                <button
                  type="button"
                  disabled={stage === "sending"}
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
      </div>
    </main>
  );
}
