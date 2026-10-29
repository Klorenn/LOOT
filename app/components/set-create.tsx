"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { PageHeader, Em } from "@/components/page-header";
import { BetaNotice } from "@/components/network-banner";
import { useNet } from "@/components/network-provider";
import { normalizeAnswer, randomSalt } from "@/lib/answer";
import { KDF_ARGON2ID_V1, deriveAnswerField, type Kdf } from "@/lib/kdf";
import { AnswerStrengthNote } from "@/components/answer-strength-note";
import { answerBlockError } from "@/lib/answer-strength";
import { poseidon2, fieldToHex } from "@/lib/zk";
import { chestPath, encodeChestId } from "@/lib/chest-code";
import { SET_LIMITS, maxSetSize, setCapError, setSaltsFragment, validateSetShape } from "@/lib/chest-set";
import { createdCount, runSetCreation, nextToCreate, type SetCreateDeps, type SetItem, type SetProgress } from "@/lib/chest-set-create";
import { isV2Ref } from "@/lib/registry";
import { confirmMeta, createChestOnChain, createSetOnChain, reserveMeta } from "@/lib/create-chest";
import { expiryError, defaultExpiry } from "@/lib/expiry";
import { stroopsToXlm } from "@/lib/config";
import { withNet } from "@/lib/network";
import { balanceInfo, parseXlmAmount } from "@/lib/send";
import { useSession } from "@/lib/session";
import { draftKey, isUnfinished, parseDraft, remainingCount, resumeError, serializeDraft, type SetDraft } from "@/lib/set-draft";

type Row = { question: string; hint: string; answer: string; prize: string };
const emptyRow = (): Row => ({ question: "", hint: "", answer: "", prize: "1" });

/**
 * Create a SET of chests: one question, one answer and one prize per chest. Under the hood each question is
 * its own registry chest with max_claims = 1 and its own fingerprint, so knowing answer 1 does not help with
 * question 2. N chests = N transactions = N signatures. See lib/chest-set.ts and lib/chest-set-create.ts.
 *
 * "One Loot per account per set" is enforced by this app's relayer only (off-chain). It is not an on-chain
 * guarantee: someone with several accounts, or calling the contract directly, can take more than one.
 */
export function SetCreate() {
  const { NETWORK, NETWORK_LC, CONFIG_INCOMPLETE, CAPS, IS_MAINNET, CREATE_VERSION } = useNet();
  // New registry v2 set chests hash answers with argon2id (lib/kdf.ts), tagged per chest in the metadata.
  const kdf: Kdf = !IS_MAINNET && CREATE_VERSION === 2 ? KDF_ARGON2ID_V1 : "v1";
  const { player } = useSession();
  const net = IS_MAINNET ? "mainnet" : "testnet";

  const [title, setTitle] = useState("");
  const [listed, setListed] = useState(true);
  const [expires, setExpires] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow()]);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [working, setWorking] = useState<number | null>(null);
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [bal, setBal] = useState<{ max: bigint; balance: bigint } | null>(null);
  const [copied, setCopied] = useState(false);
  /** One random salt per question for the form being filled in (a retry reuses the same fingerprints). */
  const salts = useRef<string[]>([]);

  useEffect(() => setExpires(defaultExpiry()), []);

  // Record of an unfinished set from an earlier attempt (rejected signature, closed tab, ...).
  useEffect(() => {
    try {
      const d = parseDraft(localStorage.getItem(draftKey(net)));
      setDraft(d && isUnfinished(d) ? d : null);
    } catch {
      setDraft(null);
    }
  }, [net]);

  function persist(d: SetDraft | null) {
    try {
      if (d && isUnfinished(d)) localStorage.setItem(draftKey(net), serializeDraft(d));
      else localStorage.removeItem(draftKey(net));
    } catch {
      /* storage blocked: the in-memory state still works for this session */
    }
  }

  const kind = player?.kind ?? "wallet";
  const maxRows = maxSetSize(kind, IS_MAINNET);

  const prizes = rows.map((r) => parseXlmAmount(r.prize));
  const allPrizes = prizes.every((p): p is bigint => !!p && p > BigInt(0)) ? (prizes as bigint[]) : null;
  const total = allPrizes ? allPrizes.reduce((a, b) => a + b, BigInt(0)) : null;
  const capBad = allPrizes ? setCapError(allPrizes, CAPS) : null;
  const short = !!(total && bal && bal.max < total);

  useEffect(() => {
    if (!player) return;
    let off = false;
    balanceInfo(player)
      .then((b) => !off && setBal({ max: b.max, balance: b.balance }))
      .catch(() => !off && setBal(null));
    return () => {
      off = true;
    };
  }, [player, draft, busy]);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setFieldErr({});
  }

  function validate(): string | null {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the set a title.";
    rows.forEach((r, i) => {
      if (!r.question.trim()) e[`q${i}`] = "Write the question.";
      if (!normalizeAnswer(r.answer)) e[`a${i}`] = "Enter the answer.";
      else {
        const weak = answerBlockError(r.answer, !IS_MAINNET); // sets are testnet-only: block trivial answers, warn on weak
        if (weak) e[`a${i}`] = weak;
      }
      if (!prizes[i] || prizes[i]! <= BigInt(0)) e[`p${i}`] = "Reward must be greater than 0 (up to 7 decimals).";
    });
    const shape = validateSetShape(rows.length, kind, IS_MAINNET);
    if (shape) e.size = shape;
    if (!e.size && allPrizes && capBad) e.caps = capBad;
    const ee = expiryError(expires, IS_MAINNET);
    if (ee) e.expires = ee;
    setFieldErr(e);
    return Object.keys(e).length ? "Check the highlighted fields." : null;
  }

  async function execute(d: SetDraft) {
    if (!player) return;
    const blocked = resumeError(d, player.publicKey, IS_MAINNET);
    if (blocked) {
      setError(blocked);
      return;
    }
    setBusy(true);
    setError(null);
    const deps: SetCreateDeps = {
      reserve: (item, setId) => {
        setPhase("Saving question details…");
        return reserveMeta(
          player,
          { fingerprintHex: item.fingerprintHex, prizeStroops: item.prizeStroops, maxClaims: 1, deadline: d.deadline },
          {
            template: "set",
            question: item.question,
            hint: item.hint,
            difficulty: 2,
            prize: Number(stroopsToXlm(item.prizeStroops)),
            listed: d.listed,
            salt: item.salt,
            set: { index: item.index, size: d.items.length, title: d.title, id: setId },
            ...(kdf !== "v1" ? { kdf } : {}),
          },
        );
      },
      // Registry v2: the set is allocated on-chain first and every question is created INSIDE it
      // (create_chest_in_set). Registry v1: unchanged (set id = chest id of question 1, off-chain grouping).
      ...(CREATE_VERSION === 2
        ? {
            createSet: async () => {
              setPhase("Creating the set…");
              const r = await createSetOnChain(player, (p) => setPhase(p === "signing" ? "Approve in your wallet…" : "Waiting for the network…"));
              return { setId: r.setRef, hash: r.hash };
            },
          }
        : {}),
      create: (item, setId) => {
        // a draft keeps working only on the registry its set was started in
        if (setId !== undefined && CREATE_VERSION === 2 && !isV2Ref(setId))
          throw new Error("This set was started on the previous registry and can’t be continued here.");
        if (setId !== undefined && CREATE_VERSION === 1 && isV2Ref(setId))
          throw new Error("This set was started on the new registry, which isn’t enabled right now.");
        return createChestOnChain(
          player,
          { fingerprintHex: item.fingerprintHex, prizeStroops: item.prizeStroops, maxClaims: 1, deadline: d.deadline, ...(CREATE_VERSION === 2 && setId !== undefined ? { setRef: setId } : {}) },
          (p) => setPhase(p === "signing" ? "Approve in your wallet…" : "Waiting for the network…"),
        );
      },
      confirm: (item, chestId, hash) => {
        setPhase("Publishing…");
        return confirmMeta(chestId, item.fingerprintHex, hash);
      },
      onProgress: (p, w) => {
        setWorking(w);
        const next = { ...d, progress: p };
        setDraft(next);
        persist(next);
      },
    };
    try {
      const r = await runSetCreation(d.items, deps, d.progress);
      const finished: SetDraft = { ...d, progress: r.progress };
      setDraft(finished);
      persist(finished);
      if (r.status !== "complete") {
        const k = r.failedAt + 1;
        const made = createdCount(r.progress);
        setError(
          r.stage === "save"
            ? `Question ${k} is on-chain but its details weren’t published yet. ${r.message}`
            : `Stopped at question ${k} of ${d.items.length}: ${r.message}`,
        );
        if (made > 0 && r.stage !== "save")
          setError(
            (prev) =>
              `${prev} The ${made} chest${made === 1 ? "" : "s"} already created ${made === 1 ? "is" : "are"} live and funded; nothing was charged for the rest.`,
          );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPhase(null);
      setWorking(null);
    }
  }

  async function onCreate() {
    const bad = validate();
    if (bad) return setError(bad);
    if (!player || !allPrizes) return;
    if (CONFIG_INCOMPLETE) return setError("Mainnet configuration is incomplete; chest creation is disabled.");
    setBusy(true);
    setError(null);
    try {
      // Each question gets its own random salt and fingerprint, computed on this device. Answers never leave it.
      while (salts.current.length < rows.length) salts.current.push(randomSalt().toString());
      if (kdf !== "v1") setPhase("Hashing your answers…");
      const items: SetItem[] = await Promise.all(
        rows.map(async (r, i) => ({
          index: i,
          fingerprintHex: fieldToHex(
            await poseidon2(
              await deriveAnswerField(normalizeAnswer(r.answer), BigInt(salts.current[i]), kdf),
              BigInt(salts.current[i]),
            ),
          ),
          salt: salts.current[i],
          question: r.question.trim(),
          hint: r.hint.trim() || undefined,
          prizeStroops: allPrizes[i],
        })),
      );
      const d: SetDraft = {
        v: 1,
        net,
        creator: player.publicKey,
        title: title.trim(),
        listed,
        deadline: Math.floor(new Date(expires).getTime() / 1000),
        items,
        progress: { members: [] },
      };
      setDraft(d);
      persist(d);
      setBusy(false);
      await execute(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const link = useMemo(() => {
    if (!draft || draft.progress.setId === undefined || typeof window === "undefined") return null;
    const base = withNet(`${window.location.origin}/set/${encodeChestId(draft.progress.setId)}`, net);
    return draft.listed ? base : `${base}${setSaltsFragment(draft.items.map((i) => i.salt))}`;
  }, [draft, net]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  }

  function discard() {
    persist(null);
    setDraft(null);
    setError(null);
    salts.current = [];
  }

  // ---------- an unfinished or finished set from this device ----------
  if (draft) {
    const size = draft.items.length;
    const made = createdCount(draft.progress);
    const left = remainingCount(draft);
    const unsaved = draft.progress.members.some((m) => !m.saved);
    const complete = left === 0 && !unsaved;
    return (
      <main>
        <PageHeader
          tint={complete ? "ok" : "proof"}
          eyebrow={`${complete ? "Set created" : busy && working !== null ? `Creating ${working + 1}/${size}` : "Set in progress"} · ${NETWORK_LC}`}
          title={
            complete ? (
              <>
                {draft.title} is <Em tone="ok">live.</Em>
              </>
            ) : (
              <>
                {made} of {size} <Em>created</Em>
              </>
            )
          }
          lead={
            complete
              ? "Share the set link. Each question opens its own chest."
              : "Each question is its own transaction. Chests already created are live and funded."
          }
        />
        <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-6 py-12">
          {busy && (
            <p className="font-mono text-[13px] text-[var(--proof)]" role="status">
              {working !== null ? `Creating ${working + 1}/${size}` : "Working"}
              {phase ? ` · ${phase}` : ""}
            </p>
          )}

          <ol className="divide-y divide-[var(--line)] rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            {draft.items.map((it) => {
              const m = draft.progress.members.find((x) => x.index === it.index);
              const state = m?.chestId === undefined ? (busy && working === it.index ? "working" : "pending") : m.saved ? "live" : "unsaved";
              return (
                <li key={it.index} className="flex items-center justify-between gap-4 px-4 py-3 text-[14px]">
                  <span className="min-w-0">
                    <span className="font-mono text-[12px] text-[var(--dim)]">{String(it.index + 1).padStart(2, "0")} </span>
                    <span className="break-words">{it.question}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12px]">
                    {state === "live" && m?.chestId !== undefined ? (
                      <Link href={chestPath(m.chestId)} className="text-[var(--ok)] underline underline-offset-2">
                        live
                      </Link>
                    ) : state === "unsaved" ? (
                      <span className="text-[var(--gold)]">on-chain, details not published</span>
                    ) : state === "working" ? (
                      <span className="text-[var(--proof)]">creating…</span>
                    ) : (
                      <span className="text-[var(--dim)]">not created</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {error && (
            <p className="text-[14px] leading-[1.55] text-[var(--gold)]" role="alert">
              {error}
            </p>
          )}

          {!complete && (
            <div className="space-y-2 text-[13px] leading-[1.55] text-[var(--muted)]">
              <p>
                This progress is saved on this device. You can continue now or later from this page.
                {left > 0 ? ` ${left} question${left === 1 ? "" : "s"} still need${left === 1 ? "s" : ""} a signature.` : ""}
              </p>
              <p>
                Unclaimed prizes of the chests that exist can be recovered after the expiry, from your dashboard.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!complete && (
              <button
                type="button"
                disabled={busy || !player}
                onClick={() => void execute(draft)}
                className="btn-landing btn-landing-p disabled:opacity-40"
              >
                {left > 0 ? `Continue from question ${(nextToCreate(draft.progress, size) ?? 0) + 1}` : "Retry publishing details"}
              </button>
            )}
            {!complete && (
              <button type="button" disabled={busy} onClick={discard} className="btn-landing btn-landing-s disabled:opacity-40">
                Forget this record
              </button>
            )}
            {complete && (
              <button type="button" onClick={discard} className="btn-landing btn-landing-s">
                Create another set
              </button>
            )}
            <Link href="/dashboard" className="btn-landing btn-landing-s">
              Dashboard
            </Link>
          </div>
          {!complete && !player && (
            <p className="text-[13px] text-[var(--dim)]">
              <Link href="/login?next=/create" className="text-[var(--proof)] underline underline-offset-2">
                Log in
              </Link>{" "}
              with the same account to continue.
            </p>
          )}

          {link && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-[14px] bg-white p-3">
                <QRCodeSVG value={link} size={150} />
              </div>
              <p className="w-full break-all rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-3 text-center font-mono text-[13px] text-[var(--proof)]">
                {link}
              </p>
              {!draft.listed && (
                <p className="text-center text-[14px] text-[var(--gold)]">
                  Save this link now. The part after # holds the secrets for every question and is not stored on any
                  server: if you lose it, nobody can solve this set.
                </p>
              )}
              <button type="button" onClick={() => void copyLink()} className="btn-landing btn-landing-p">
                {copied ? "Copied" : "Copy set link"}
              </button>
              {!complete && made > 0 && (
                <p className="text-center text-[13px] text-[var(--dim)]">
                  The link already works for the {made} question{made === 1 ? "" : "s"} created so far.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ---------- the form ----------
  return (
    <main>
      <PageHeader
        eyebrow={`New set · Stellar ${NETWORK_LC}`}
        title={
          <>
            Create a <Em>set</Em>
          </>
        }
        lead="Several questions, one prize each, one link. Every question is its own chest with its own answer, so knowing one answer doesn’t help with another."
      />

      {!player && (
        <div className="mx-auto max-w-[1200px] px-6 pt-2">
          <p className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] px-4 py-3 text-[14px] text-[var(--muted)]">
            Preview mode — explore the form freely.{" "}
            <Link href="/login?next=/create" className="text-[var(--proof)] underline-offset-2 hover:underline">
              Log in
            </Link>{" "}
            when you&apos;re ready to fund a set on {NETWORK_LC}.
          </p>
        </div>
      )}

      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-10">
        <BetaNotice />

        <div className="space-y-5 rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
          <Field label="Set title" hint="Public: shown on the set page and in Explore" error={fieldErr.title}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={SET_LIMITS.title}
              placeholder="e.g. Stellar trivia"
              className={`h-11 rounded-[10px] ${fieldErr.title ? "border-[var(--red)]" : ""}`}
            />
          </Field>

          <Field
            label="Expires"
            hint="Same expiry for every chest. Unclaimed prizes can be recovered from your dashboard after it."
            error={fieldErr.expires}
          >
            <Input
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="h-11 rounded-[10px] font-mono"
            />
          </Field>

          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="mt-1" />
            <span>
              List this set in Explore
              <span className="block font-mono text-[12px] text-[var(--dim)]">
                Off = private link. The secrets travel in the link after #, never to a server.
              </span>
            </span>
          </label>
        </div>

        <ol className="space-y-4">
          {rows.map((r, i) => (
            <li key={i} className="space-y-4 rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                  Question {i + 1}
                </span>
                {rows.length > SET_LIMITS.min && (
                  <button
                    type="button"
                    onClick={() => {
                      setRows((rs) => rs.filter((_, j) => j !== i));
                      salts.current = []; // positions shifted: fresh salts for the new layout
                      setFieldErr({});
                    }}
                    className="font-mono text-[12px] text-[var(--dim)] underline underline-offset-2 hover:text-[var(--text)]"
                  >
                    Remove
                  </button>
                )}
              </div>
              <Field label="Question" hint="Public" error={fieldErr[`q${i}`]}>
                <textarea
                  value={r.question}
                  onChange={(e) => setRow(i, { question: e.target.value })}
                  maxLength={200}
                  rows={2}
                  className={`w-full rounded-[10px] border bg-[var(--bg)] px-3 py-2.5 text-[15px] outline-none ${
                    fieldErr[`q${i}`] ? "border-[var(--red)]" : "border-[var(--line)]"
                  }`}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field
                  label="Answer"
                  hint="Hashed on this device with its own salt. The answer is never sent to a server."
                  error={fieldErr[`a${i}`]}
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    value={r.answer}
                    onChange={(e) => setRow(i, { answer: e.target.value })}
                    className={`h-11 rounded-[10px] font-mono ${fieldErr[`a${i}`] ? "border-[var(--red)]" : ""}`}
                  />
                  <AnswerStrengthNote text={r.answer} enforced={!IS_MAINNET} />
                </Field>
                <Field label="Reward (XLM)" error={fieldErr[`p${i}`]}>
                  <Input
                    inputMode="decimal"
                    value={r.prize}
                    onChange={(e) => setRow(i, { prize: e.target.value })}
                    className={`h-11 rounded-[10px] font-mono ${fieldErr[`p${i}`] ? "border-[var(--red)]" : ""}`}
                  />
                </Field>
              </div>
              <Field label="Hint (optional)">
                <Input value={r.hint} onChange={(e) => setRow(i, { hint: e.target.value })} maxLength={200} className="h-11 rounded-[10px]" />
              </Field>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={rows.length >= maxRows}
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="btn-landing btn-landing-s disabled:opacity-40"
          >
            Add question
          </button>
          <span className="font-mono text-[12px] text-[var(--dim)]">
            {rows.length} of {maxRows} max
            {kind === "passkey" && IS_MAINNET ? " (passkey accounts on mainnet)" : ""}
          </span>
        </div>
        {fieldErr.size && (
          <p className="text-[13px] text-[var(--red)]" role="alert">
            {fieldErr.size}
          </p>
        )}

        <div className="space-y-2 rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5 font-mono text-[13px]">
          <p>
            <span className="text-[var(--dim)]">Questions · </span>
            {rows.length}
          </p>
          <p>
            <span className="text-[var(--dim)]">Escrow in total · </span>
            <span className="text-[var(--gold)]">{total ? `${stroopsToXlm(total)} XLM` : "—"}</span>
          </p>
          <p>
            <span className="text-[var(--dim)]">Your balance · </span>
            {bal ? `${stroopsToXlm(bal.balance)} XLM` : "…"}
          </p>
          <p className="text-[var(--dim)]">
            {rows.length} chests means {rows.length} transactions: you approve {rows.length} times
            {player?.kind === "passkey" ? `; the relayer covers the network fees on ${NETWORK_LC}` : " and each one pays its own network fee"}.
          </p>
          {capBad && (
            <p className="text-[var(--red)]" role="alert">
              {capBad}
            </p>
          )}
          {fieldErr.caps && !capBad && (
            <p className="text-[var(--red)]" role="alert">
              {fieldErr.caps}
            </p>
          )}
          {short && (
            <p className="text-[var(--red)]" role="alert">
              Not enough XLM to fund this set.
            </p>
          )}
          <p className="text-[var(--dim)]">
            Each account can take one chest per set. The app enforces that, but it is not an on-chain guarantee:
            someone with several accounts could take more.
          </p>
          <p className="text-[var(--dim)]">Network · {NETWORK.explorerUrl.replace(/^https?:\/\//, "")}</p>
        </div>

        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy || short || !player || !!capBad}
            className="btn-landing btn-landing-p disabled:opacity-40"
          >
            {busy ? (phase ?? "Preparing…") : `Fund & create set (${rows.length} signatures)`}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">{label}</span>
      {children}
      {error && <span className="font-mono text-[12px] text-[var(--red)]">{error}</span>}
      {hint && !error && <span className="font-mono text-[12px] text-[var(--dim)]">{hint}</span>}
    </label>
  );
}
