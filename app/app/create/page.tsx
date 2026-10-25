"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { PageHeader, Em } from "@/components/page-header";
import { LogoChest } from "@/components/logo-chest";
import { ExampleTag } from "@/components/example-tag";
import { KV } from "@/components/kv";
import { TEMPLATES, type ChestTemplate } from "@/lib/templates";
import { answerToField, normalizeAnswer, randomSalt } from "@/lib/answer";
import { poseidon2, fieldToHex } from "@/lib/zk";
import { chestPath } from "@/lib/chest-code";
import { useSession } from "@/lib/session";
import { NETWORK, stroopsToXlm } from "@/lib/config";
import { balanceInfo, parseXlmAmount, SendError } from "@/lib/send";
import { confirmMeta, createChestOnChain, reserveMeta } from "@/lib/create-chest";
import { QuizBuilder } from "@/components/quiz-builder";
import { draftToQuiz, emptyDraftQuestion, type DraftQuestion } from "@/lib/quiz-draft";
import { QUIZ_LIMITS, quizIsGuessable } from "@/lib/quiz";

type Mode = "riddle" | "quiz";

const STEPS = [
  "Puzzle",
  "Answer hash",
  "Reward",
  "Expiry",
  "Review & fund",
] as const;

const QUIZ_WEAK_MSG =
  "Too easy to guess: someone could try every combination offline. Use a longer typed answer, or add more questions and options.";

const MIN_EXPIRY_S = 5 * 60;
const MAX_EXPIRY_S = 90 * 24 * 3600;

/** Vencimiento obligatorio y futuro: con deadline 0 el cofre nunca se podría cerrar (premio bloqueado). */
function expiryError(expires: string): string | null {
  const t = new Date(expires).getTime();
  const now = Date.now() / 1000;
  const sec = Math.floor(t / 1000);
  if (!expires || !Number.isFinite(t))
    return "Pick an expiry date — unclaimed prize can only be recovered after it.";
  if (sec < now + MIN_EXPIRY_S) return "Expiry must be at least 5 minutes from now.";
  if (sec > now + MAX_EXPIRY_S) return "Expiry can be at most 90 days from now.";
  return null;
}

export default function CreateChestPage() {
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<ChestTemplate>(TEMPLATES[2]);
  const [question, setQuestion] = useState(TEMPLATES[2].question);
  const [hint, setHint] = useState(TEMPLATES[2].hint);
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<Mode>("riddle");
  const [quizDraft, setQuizDraft] = useState<DraftQuestion[]>(() => [emptyDraftQuestion("single")]);
  const [quizErrIdx, setQuizErrIdx] = useState<number | undefined>(undefined);
  const [hashHex, setHashHex] = useState<string | null>(null);
  const [hashOk, setHashOk] = useState(false);
  const [prize, setPrize] = useState(String(TEMPLATES[2].prize));
  const [difficulty, setDifficulty] = useState(2);
  const [expires, setExpires] = useState("");
  const [maxClaims, setMaxClaims] = useState(TEMPLATES[2].maxClaims);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    chestId: number;
    link: string;
    explorer: string | null;
    priv: boolean;
    saved: boolean;
    fingerprintHex: string;
    hash: string;
  } | null>(null);
  const { player } = useSession();
  const [listed, setListed] = useState(true);
  const [phase, setPhase] = useState<string | null>(null);
  const [bal, setBal] = useState<{ max: bigint; balance: bigint } | null>(null);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // la sal se genera una vez por intento: un reintento reusa la misma huella (la reserva es idempotente)
  const attempt = useRef<{ salt: bigint } | null>(null);

  useEffect(() => {
    if (!expires) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      // datetime-local es hora LOCAL: toISOString() daría UTC y corrido el vencimiento
      const pad = (n: number) => String(n).padStart(2, "0");
      setExpires(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    }
  }, [expires]);

  async function hashAnswer(text: string = answer) {
    const n = normalizeAnswer(text);
    if (!n) {
      setHashHex(null);
      setHashOk(false);
      return;
    }
    attempt.current ??= { salt: randomSalt() };
    const fp = await poseidon2(answerToField(n), attempt.current.salt);
    setHashHex(fieldToHex(fp));
    setHashOk(true);
    setFieldErr((e) => ({ ...e, answer: "" }));
  }

  // Cuestionario: todas las respuestas correctas se combinan en un solo secreto (lib/quiz.ts)
  // que sigue el mismo camino que la respuesta de un acertijo.
  const quizResult = useMemo(() => (mode === "quiz" ? draftToQuiz(quizDraft) : null), [mode, quizDraft]);
  const quizOk = quizResult && !("error" in quizResult) ? quizResult : null;
  const quizWeak = !!quizOk && quizIsGuessable(quizOk.quiz, quizOk.answers);
  /** Lo que se hashea: la respuesta del acertijo o el secreto del cuestionario. */
  const secretText = mode === "quiz" ? (quizOk?.secret ?? "") : answer;

  useEffect(() => {
    if (mode !== "quiz") return;
    void hashAnswer(secretText);
    // hashAnswer solo depende del texto que recibe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, secretText]);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    // el hash del otro modo ya no vale
    setHashHex(null);
    setHashOk(false);
    setQuizErrIdx(undefined);
    setFieldErr({});
    if (m === "riddle" && answer) void hashAnswer(answer);
    if (m === "quiz" && question === tpl.question) {
      setQuestion("");
      setHint("");
    }
  }

  function pick(t: ChestTemplate) {
    setTpl(t);
    setQuestion(t.question);
    setHint(t.hint);
    setAnswer("");
    setPrize(String(t.prize));
    setMaxClaims(t.maxClaims);
    setHashHex(null);
    setHashOk(false);
    setResult(null);
  }

  const prizeStroops = parseXlmAmount(prize);
  const totalStroops =
    prizeStroops && Number.isSafeInteger(maxClaims) && maxClaims >= 1
      ? prizeStroops * BigInt(maxClaims)
      : null;
  const short = !!(totalStroops && bal && bal.max < totalStroops);

  useEffect(() => {
    if (!player || step < 4) return;
    let off = false;
    balanceInfo(player)
      .then((b) => !off && setBal({ max: b.max, balance: b.balance }))
      .catch(() => !off && setBal(null));
    return () => {
      off = true;
    };
  }, [player, step, result]);

  async function friendbot() {
    if (!player) return;
    setFaucetBusy(true);
    setError(null);
    try {
      const r = await fetch(`${NETWORK.friendbotUrl}?addr=${encodeURIComponent(player.publicKey)}`);
      if (!r.ok && r.status !== 400) throw new Error(`Friendbot returned ${r.status}`);
      setBal(await balanceInfo(player));
    } catch (e) {
      setError(`Couldn’t get test XLM: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFaucetBusy(false);
    }
  }

  function validateStep(): boolean {
    const e: Record<string, string> = {};
    if (step === 0 && !question.trim())
      e.question = mode === "quiz" ? "Give the quiz a title." : "Puzzle text is required.";
    if (step === 1 && mode === "quiz") {
      if (quizResult && "error" in quizResult) {
        e.answer = quizResult.error;
        setQuizErrIdx(quizResult.index);
      } else if (quizWeak) {
        e.answer = QUIZ_WEAK_MSG;
      } else setQuizErrIdx(undefined);
    } else if (step === 1 && !hashOk)
      e.answer = "Enter an answer; it's hashed on this device when you leave the field.";
    if (step === 2 && !prizeStroops) e.prize = "Enter a reward greater than 0 (up to 7 decimals).";
    if (step === 3 && (!Number.isSafeInteger(maxClaims) || maxClaims < 1)) e.maxClaims = "At least 1 claim.";
    if (step === 3) {
      const ee = expiryError(expires);
      if (ee) e.expires = ee;
    }
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function onFund() {
    if (!validateStep()) return;
    if (!player || !prizeStroops) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "quiz" && (!quizOk || quizWeak)) {
        setStep(1);
        setFieldErr({ answer: quizWeak ? QUIZ_WEAK_MSG : "Finish the quiz first." });
        return;
      }
      attempt.current ??= { salt: randomSalt() };
      const salt = attempt.current.salt;
      const n = normalizeAnswer(secretText);
      const fp = await poseidon2(answerToField(n), salt);
      const fingerprintHex = fieldToHex(fp);
      const ee = expiryError(expires);
      if (ee) {
        setStep(3);
        setFieldErr({ expires: ee });
        return;
      }
      const deadline = Math.floor(new Date(expires).getTime() / 1000);
      const input = { fingerprintHex, prizeStroops, maxClaims, deadline };

      setPhase("Saving chest details…");
      await reserveMeta(player, input, {
        template: mode === "quiz" ? "quiz" : tpl.id,
        question,
        hint: hint || undefined,
        difficulty,
        ...(mode === "quiz" && quizOk ? { quiz: quizOk.quiz } : {}),
        prize: Number(stroopsToXlm(prizeStroops)),
        listed,
        salt: salt.toString(),
      });

      const { chestId, hash } = await createChestOnChain(player, input, (p) =>
        setPhase(p === "signing" ? "Approve in your wallet…" : "Waiting for the network…"),
      );

      setPhase("Publishing…");
      let saved = true;
      try {
        await confirmMeta(chestId, fingerprintHex, hash);
      } catch {
        saved = false;
      }
      const base = `${window.location.origin}${chestPath(chestId)}`;
      setResult({
        chestId,
        link: listed ? base : `${base}#s=${salt.toString()}`,
        explorer: `https://stellar.expert/explorer/${process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "public" : "testnet"}/tx/${hash}`,
        priv: !listed,
        saved,
        fingerprintHex,
        hash,
      });
      attempt.current = null;
    } catch (err) {
      setError(
        err instanceof SendError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  async function retrySave() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await confirmMeta(result.chestId, result.fingerprintHex, result.hash);
      setResult({ ...result, saved: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles bloqueado: el link está visible para copiarlo a mano */
    }
  }

  const diffLabel = ["Easy", "Medium", "Hard", "Brutal"][difficulty - 1] || "Hard";
  const previewHash = useMemo(
    () => (hashHex ? `${hashHex.slice(0, 10)}…` : "—"),
    [hashHex],
  );

  if (result) {
    return (
      <main>
        <PageHeader
          tint="ok"
          eyebrow="Chest created · testnet"
          title={
            <>
              Chest #{result.chestId} is <Em tone="ok">live.</Em>
            </>
          }
          lead={
            result.priv
              ? "Private chest. Only people with the full link can solve it."
              : "Share the link. Solvers prove in-browser; only the hash sits on-chain."
          }
        />
        <div className="mx-auto flex max-w-[560px] flex-col items-center gap-6 px-6 py-12">
          <div className="rounded-[14px] bg-white p-3">
            <QRCodeSVG value={result.link} size={160} />
          </div>
          <p className="w-full break-all rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-3 text-center font-mono text-[13px] text-[var(--proof)]">
            {result.link}
          </p>
          {result.priv && (
            <p className="text-center text-[14px] text-[var(--gold)]" role="alert">
              Save this link now. The secret after # is never stored anywhere else: if you lose it,
              nobody can solve this chest.
            </p>
          )}
          {!result.saved && (
            <div className="text-center text-[14px] text-[var(--gold)]" role="alert">
              The chest is on-chain, but its details (question, hint) weren’t published yet.
              <button
                type="button"
                disabled={busy}
                onClick={() => void retrySave()}
                className="ml-2 underline underline-offset-2"
              >
                {busy ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => void copyLink()} className="btn-landing btn-landing-p">
              {copied ? "Copied" : "Copy link"}
            </button>
            <Link href={chestPath(result.chestId)} className="btn-landing btn-landing-s">
              Open chest
            </Link>
            <Link href="/dashboard" className="btn-landing btn-landing-s">
              Dashboard
            </Link>
          </div>
          {result.explorer && (
            <a
              href={result.explorer}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-[var(--dim)] underline underline-offset-2"
            >
              View transaction ↗
            </a>
          )}
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        eyebrow={`New chest · step ${step + 1} of ${STEPS.length} · Stellar testnet`}
        title={
          <>
            Create a <Em>chest</Em>
          </>
        }
        lead="Escrow a prize behind a riddle. Only the hash of the answer goes on-chain. You can preview every step; funding needs a login."
      />

      {!player && (
        <div className="mx-auto max-w-[1200px] px-6 pt-2">
          <p className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] px-4 py-3 text-[14px] text-[var(--muted)]">
            Preview mode — explore the form freely.{" "}
            <Link href="/login?next=/create" className="text-[var(--proof)] underline-offset-2 hover:underline">
              Log in
            </Link>{" "}
            when you&apos;re ready to fund a chest on testnet.
          </p>
        </div>
      )}

      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-10 lg:grid-cols-[220px_1fr_340px]">
        {/* Stepper */}
        <nav aria-label="Create steps" className="space-y-1">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => i <= step && setStep(i)}
                className="flex w-full items-center gap-3 py-2.5 text-left font-mono text-[13px]"
              >
                <span
                  className={
                    done
                      ? "text-[var(--ok)]"
                      : current
                        ? "text-[var(--proof)]"
                        : "text-[var(--dim)]"
                  }
                >
                  {done ? "✓" : current ? "●" : "○"}{" "}
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={
                    current ? "text-[var(--text)]" : "text-[var(--muted)]"
                  }
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Form */}
        <div className="min-w-0">
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
              <span className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                {String(step + 1).padStart(2, "0")} · {STEPS[step]}
              </span>
            </header>
            <div className="space-y-5 p-5">
              {step === 0 && (
                <div
                  role="radiogroup"
                  aria-label="Chest type"
                  className="inline-flex self-start overflow-hidden rounded-[10px] border border-[var(--line)]"
                >
                  {(
                    [
                      ["riddle", "Single riddle"],
                      ["quiz", "Quiz"],
                    ] as const
                  ).map(([m, label], i) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => switchMode(m)}
                      className={`px-4 py-2 font-mono text-[12px] ${
                        mode === m ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--muted)]"
                      } ${i ? "border-l border-[var(--line)]" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {step === 0 && mode === "quiz" && (
                <>
                  <p className="text-[14px] leading-[1.55] text-[var(--muted)]">
                    Players answer every question. All right? They win. One wrong? No prize, and
                    they don&apos;t learn which one failed.
                  </p>
                  <Field
                    label="Quiz title"
                    hint="Public: shown to everyone who opens the chest"
                    error={fieldErr.question}
                  >
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      maxLength={QUIZ_LIMITS.title}
                      placeholder="e.g. Stellar basics"
                      className={`h-11 rounded-[10px] ${fieldErr.question ? "border-[var(--red)]" : ""}`}
                    />
                  </Field>
                </>
              )}

              {step === 0 && mode === "riddle" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => pick(t)}
                        className={`rounded-[10px] border p-3 text-left text-sm ${
                          tpl.id === t.id
                            ? "border-[var(--proof)] bg-[var(--s2)]"
                            : "border-[var(--line)] hover:border-[var(--line2)]"
                        }`}
                      >
                        <p className="font-medium">{t.name}</p>
                        <p className="mt-1 text-[12px] text-[var(--dim)]">
                          {t.blurb}
                        </p>
                      </button>
                    ))}
                  </div>
                  <Field
                    label="Puzzle"
                    hint="Public: shown to everyone who opens the chest"
                    error={fieldErr.question}
                  >
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      maxLength={QUIZ_LIMITS.title}
                      rows={4}
                      className={`w-full rounded-[10px] border bg-[var(--bg)] px-3 py-2.5 text-[15px] outline-none ${
                        fieldErr.question
                          ? "border-[var(--red)]"
                          : "border-[var(--line)]"
                      }`}
                    />
                  </Field>
                  <Field label="Hint (optional)">
                    <Input
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      className="h-11 rounded-[10px]"
                    />
                  </Field>
                </>
              )}

              {step === 1 && mode === "quiz" && (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px] leading-[1.55] text-[var(--muted)]">
                    Write the questions and mark the right answers. Only a hash of all the right
                    answers together goes on-chain. The answers never leave this device.
                  </p>
                  <QuizBuilder
                    draft={quizDraft}
                    onChange={(d) => {
                      setQuizDraft(d);
                      setQuizErrIdx(undefined);
                    }}
                    errorIndex={quizErrIdx}
                  />
                  {fieldErr.answer ? (
                    <p className="text-[13px] text-[var(--red)]" role="alert">
                      {fieldErr.answer}
                    </p>
                  ) : quizWeak ? (
                    <p className="text-[13px] text-[var(--gold)]" role="alert">
                      {QUIZ_WEAK_MSG}
                    </p>
                  ) : quizOk && hashOk && hashHex ? (
                    <p className="text-[13px] text-[var(--ok)]">
                      ✓ Hashed locally: {hashHex.slice(0, 18)}… Only the hash is stored.
                    </p>
                  ) : null}
                </div>
              )}

              {step === 1 && mode === "riddle" && (
                <Field
                  label="Answer"
                  hint="Normalized to lowercase, no accents, no spaces. Never sent to any server. Security depends on the answer being hard to guess: the fingerprint is public, so short or common answers can be brute-forced offline."
                  error={fieldErr.answer}
                  ok={
                    hashOk && hashHex
                      ? `✓ Hashed locally: ${hashHex.slice(0, 18)}… Only the hash is stored.`
                      : undefined
                  }
                >
                  <Input
                    type="password"
                    placeholder={tpl.answerPlaceholder}
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setHashOk(false);
                    }}
                    onBlur={() => void hashAnswer()}
                    className={`h-11 rounded-[10px] font-mono ${
                      hashOk
                        ? "border-[var(--ok)]"
                        : fieldErr.answer
                          ? "border-[var(--red)]"
                          : ""
                    }`}
                  />
                </Field>
              )}

              {step === 1 && (
                <div>
                  <p className="mb-2 font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">
                    Who can solve it
                  </p>
                  <div className="inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]">
                    {([true, false] as const).map((v, i) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setListed(v)}
                        className={`px-3 py-2 font-mono text-[12px] ${
                          listed === v ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--muted)]"
                        } ${i ? "border-l border-[var(--line)]" : ""}`}
                      >
                        {v ? "Public · in Explore" : "Private link"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[12px] leading-[1.5] text-[var(--dim)]">
                    {listed
                      ? "Anyone can try answers offline once the salt is public — pick an answer that’s hard to guess."
                      : "The salt stays in the link (after #) and never reaches our servers. Only people with the full link can solve it. Not listed in Explore."}
                  </p>
                </div>
              )}

              {step === 2 && (
                <>
                  <Field
                    label="Reward per claim (XLM)"
                    hint="Decimals allowed, e.g. 0.1. Escrowed from your account when you create the chest."
                    error={fieldErr.prize}
                  >
                    <Input
                      inputMode="decimal"
                      value={prize}
                      onChange={(e) => setPrize(e.target.value)}
                      className="h-11 rounded-[10px] font-mono"
                    />
                  </Field>
                  <div>
                    <p className="mb-2 font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">
                      Difficulty
                    </p>
                    <div className="inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]">
                      {(["Easy", "Medium", "Hard", "Brutal"] as const).map(
                        (d, i) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDifficulty(i + 1)}
                            className={`px-3 py-2 font-mono text-[12px] ${
                              difficulty === i + 1
                                ? "bg-[var(--s2)] text-[var(--text)]"
                                : "text-[var(--muted)]"
                            } ${i ? "border-l border-[var(--line)]" : ""}`}
                          >
                            {d}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <Field
                    label="Expires"
                    hint="Unclaimed prize returns when you close the chest from your dashboard after it expires. The contract only allows closing after expiry."
                    error={fieldErr.expires}
                  >
                    <Input
                      type="datetime-local"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                      className="h-11 rounded-[10px] font-mono"
                    />
                  </Field>
                  <Field
                    label="Max claims"
                    hint="Each proof works once, but anyone who knows the answer can claim until the slots run out."
                    error={fieldErr.maxClaims}
                  >
                    <Input
                      type="number"
                      min={1}
                      value={maxClaims}
                      onChange={(e) => setMaxClaims(Math.floor(Number(e.target.value)))}
                      className="h-11 rounded-[10px] font-mono"
                    />
                  </Field>
                </>
              )}

              {step === 4 && (
                <div className="space-y-3 font-mono text-[13px]">
                  <p>
                    <span className="text-[var(--dim)]">Puzzle · </span>
                    {question.slice(0, 80)}
                    {question.length > 80 ? "…" : ""}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Hash · </span>
                    {previewHash}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Reward · </span>
                    <span className="text-[var(--gold)]">{prize}</span>
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Difficulty · </span>
                    {diffLabel}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Expires · </span>
                    {expires || "—"}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Max claims · </span>
                    {maxClaims}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Visibility · </span>
                    {listed ? "Public, listed in Explore" : "Private link"}
                  </p>
                  <div className="space-y-2 border-t border-[var(--line)] pt-3">
                    <p>
                      <span className="text-[var(--dim)]">Escrow · </span>
                      <span className="text-[var(--gold)]">
                        {totalStroops ? `${stroopsToXlm(totalStroops)} XLM` : "—"}
                      </span>
                      <span className="text-[var(--dim)]">
                        {" "}
                        ({prize || "0"} × {maxClaims})
                      </span>
                    </p>
                    <p>
                      <span className="text-[var(--dim)]">Your balance · </span>
                      {bal ? `${stroopsToXlm(bal.balance)} XLM` : "…"}
                    </p>
                    {short && (
                      <div className="space-y-2" role="alert">
                        <p className="text-[var(--red)]">
                          Not enough XLM to fund this chest.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={faucetBusy}
                            onClick={() => void friendbot()}
                            className="btn-landing btn-landing-s disabled:opacity-40"
                          >
                            {faucetBusy ? "Requesting…" : "Fund with Friendbot"}
                          </button>
                          <Link
                            href="/wallet?tab=receive"
                            className="text-[var(--proof)] underline underline-offset-2"
                          >
                            Add XLM in Wallet
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[var(--dim)]">
                    {player?.kind === "passkey"
                      ? "The prize comes from your balance. The network fee is covered by the relayer on testnet."
                      : "The prize and the network fee come from your account."}
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-[var(--red)]" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="btn-landing btn-landing-s disabled:opacity-40"
            >
              ← Back
            </button>
            <button type="button" className="btn-landing btn-landing-s">
              Save draft
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="btn-landing btn-landing-p"
              >
                Continue to {STEPS[step + 1]} →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onFund()}
                disabled={busy || short || !player}
                className="btn-landing btn-landing-p disabled:opacity-40"
              >
                {busy ? (phase ?? "Funding…") : "Fund & create chest"}
              </button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
            <div className="flex items-start justify-between gap-3">
              <LogoChest className="w-[100px]" />
              <ExampleTag>preview</ExampleTag>
            </div>
            <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">
              {mode === "quiz"
                ? `Quiz · ${quizDraft.length} question${quizDraft.length === 1 ? "" : "s"}`
                : tpl.name}
            </h2>
            <p className="mt-1 font-mono text-[12px] text-[var(--dim)]">
              #draft · {diffLabel}
            </p>
            <div className="mt-4">
              <KV
                rows={[
                  {
                    label: "Reward",
                    value: (
                      <span className="text-[var(--gold)]">{prize}</span>
                    ),
                  },
                  { label: "Hash", value: previewHash },
                  {
                    label: "Expires",
                    value: expires ? expires.replace("T", " ") : "—",
                  },
                ]}
              />
            </div>
            <p className="mt-4 font-mono text-[11px] leading-[1.5] text-[var(--dim)]">
              You fund the prize from your own account.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  error,
  ok,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  ok?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">
        {label}
      </span>
      {children}
      {ok && (
        <span className="font-mono text-[12px] text-[var(--ok)]">{ok}</span>
      )}
      {error && (
        <span className="font-mono text-[12px] text-[var(--red)]">{error}</span>
      )}
      {hint && !error && !ok && (
        <span className="font-mono text-[12px] text-[var(--dim)]">{hint}</span>
      )}
    </label>
  );
}
