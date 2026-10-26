"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSession } from "@/lib/session";
import { FACTORY, NETWORK, stroopsToXlm } from "@/lib/config";
import { FALLBACK_CFG, factoryIndexOf, quoteLocal, readFactoryConfig, type FactoryCfg } from "@/lib/factory";
import { encodeRef } from "@/lib/chest-code";
import { PrizeEditor } from "./prize-editor";
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
  "Duration",
  "Review & fund",
] as const;

const QUIZ_WEAK_MSG =
  "Too easy to guess: someone could try every combination offline. Use a longer typed answer, or add more questions and options.";

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
  const [prizes, setPrizes] = useState<bigint[] | null>(null);
  const [prizeErr, setPrizeErr] = useState<string | null>(null);
  const onPrizes = useCallback((p: bigint[] | null, e: string | null) => {
    setPrizes(p);
    setPrizeErr(e);
  }, []);
  const [days, setDays] = useState(7);
  const [cfg, setCfg] = useState<FactoryCfg>(FALLBACK_CFG);
  useEffect(() => {
    void readFactoryConfig().then(({ live: _l, ...c }) => (void _l, setCfg(c)));
  }, []);
  const [difficulty, setDifficulty] = useState(2);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    address: string;
    code: string;
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
  // otra pregunta, pista, visibilidad o respuesta = otra huella: la sal del intento anterior no se reusa
  useEffect(() => {
    attempt.current = null;
    if (answer.trim()) void hashAnswer(); // la huella mostrada siempre es la del intento vigente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, hint, listed, answer]);

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
    setHashHex(null);
    setHashOk(false);
    setResult(null);
  }

  const isPasskey = player?.kind === "passkey";
  // Passkey: el relayer paga la fee de red. Cuenta G: la paga el creador (tope estimado).
  const quote = prizes ? quoteLocal(prizes, days, isPasskey ? BigInt(0) : undefined, cfg) : null;
  const short = !!(quote && bal && (isPasskey ? bal.balance : bal.max) < quote.total);

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
    if (step === 0 && question.trim().length > FACTORY.maxQuestionLen)
      e.question = `At most ${FACTORY.maxQuestionLen} characters (it is stored on-chain).`;
    if (step === 1 && mode === "quiz") {
      if (quizResult && "error" in quizResult) {
        e.answer = quizResult.error;
        setQuizErrIdx(quizResult.index);
      } else if (quizWeak) {
        e.answer = QUIZ_WEAK_MSG;
      } else setQuizErrIdx(undefined);
    } else if (step === 1 && !hashOk)
      e.answer = "Enter an answer; it's hashed on this device when you leave the field.";
    if (step === 2 && (!prizes || prizeErr)) e.prize = prizeErr ?? "Set the prizes.";
    if (step === 3 && (!Number.isInteger(days) || days < 1 || days > cfg.maxDurationDays))
      e.days = `Pick between 1 and ${cfg.maxDurationDays} days.`;
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
    if (!player || !prizes || !quote) return;
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
      const input = { question: question.trim(), fingerprintHex, prizes: prizes!, days };

      setPhase("Saving chest details…");
      await reserveMeta(player, fingerprintHex, {
        template: mode === "quiz" ? "quiz" : tpl.id,
        question: question.trim(),
        hint: hint || undefined,
        difficulty,
        ...(mode === "quiz" && quizOk ? { quiz: quizOk.quiz } : {}),
        prize: Number(stroopsToXlm(quote!.prize)),
        places: prizes!.length,
        listed,
        salt: salt.toString(),
      });

      const { address, hash } = await createChestOnChain(player, input, (p) =>
        setPhase(p === "signing" ? "Approve in your wallet…" : "Waiting for the network…"),
      );

      setPhase("Publishing…");
      let saved = true;
      try {
        await confirmMeta(address, fingerprintHex, hash);
      } catch {
        saved = false;
      }
      const index = await factoryIndexOf(address);
      const code = index === null ? "" : encodeRef({ kind: "factory", index });
      const base = `${window.location.origin}/chest/${code}`;
      setResult({
        address,
        code,
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
      await confirmMeta(result.address, result.fingerprintHex, result.hash);
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
              Your chest is <Em tone="ok">live.</Em>
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
            <Link href={`/chest/${result.code}`} className="btn-landing btn-landing-s">
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
        lead="Escrow a prize behind a riddle, in its own contract. The question is on-chain; only the hash of the answer is."
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
                    hint="Stored on-chain: public for everyone, forever."
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
                  <PrizeEditor initialEach="10" initialPlaces={10} onChange={onPrizes} />
                  {fieldErr.prize && (
                    <p className="font-mono text-[12px] text-[var(--red)]">{fieldErr.prize}</p>
                  )}
                  <div>
                    <p className="mb-2 font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">
                      Difficulty
                    </p>
                    <div className="inline-flex overflow-hidden rounded-[10px] border border-[var(--line)]">
                      {(["Easy", "Medium", "Hard", "Brutal"] as const).map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDifficulty(i + 1)}
                          className={`px-3 py-2 font-mono text-[12px] ${
                            difficulty === i + 1 ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--muted)]"
                          } ${i ? "border-l border-[var(--line)]" : ""}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <Field
                  label="Duration (days)"
                  hint={`1 to ${cfg.maxDurationDays} days. A fee of ${cfg.dailyFeeBps / 100}% of the prize per day is prepaid and the unused part is refunded when the chest closes. You can close it any time; anyone can close it after it expires and the refund still goes to you.`}
                  error={fieldErr.days}
                >
                  <Input
                    inputMode="numeric"
                    value={String(days)}
                    onChange={(e) => setDays(Math.floor(Number(e.target.value)) || 0)}
                    className="h-11 rounded-[10px] font-mono"
                  />
                </Field>
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
                    <span className="text-[var(--dim)]">Difficulty · </span>
                    {diffLabel}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Duration · </span>
                    {days} {days === 1 ? "day" : "days"}
                  </p>
                  <p>
                    <span className="text-[var(--dim)]">Visibility · </span>
                    {listed ? "Public, listed in Explore" : "Private link"}
                  </p>
                  {quote && prizes ? (
                    <div className="space-y-1.5 border-t border-[var(--line)] pt-3">
                      <Line k={`Prizes (${prizes.length} ${prizes.length === 1 ? "place" : "places"})`} v={quote.prize} gold />
                      <Line k="Creation fee (to Loot treasury)" v={quote.creationFee} />
                      <Line
                        k={`Fee reserve (${cfg.dailyFeeBps / 100}%/day × ${days})`}
                        v={quote.reserve}
                        note="Refundable: the unused part comes back when you close the chest."
                      />
                      {isPasskey ? (
                        <p className="flex justify-between gap-4">
                          <span className="text-[var(--dim)]">Network fee</span>
                          <span>paid by the relayer</span>
                        </p>
                      ) : (
                        <Line k="Network fee (estimate, max)" v={quote.network} />
                      )}
                      <div className="flex justify-between gap-4 border-t border-[var(--line)] pt-2">
                        <span className="text-[var(--text)]">Total from your account</span>
                        <span className="text-[var(--gold)]">{stroopsToXlm(quote.total)} XLM</span>
                      </div>
                      <p className="flex justify-between gap-4">
                        <span className="text-[var(--dim)]">Your balance</span>
                        <span>{bal ? `${stroopsToXlm(bal.balance)} XLM` : "…"}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-[var(--red)]">Go back and set the prizes.</p>
                  )}
                  {short && (
                    <div className="space-y-2" role="alert">
                      <p className="text-[var(--red)]">Not enough XLM to fund this chest.</p>
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
                      <span className="text-[var(--gold)]">
                        {quote ? `${stroopsToXlm(quote.prize)} XLM · ${quote.prizes.length} ${quote.prizes.length === 1 ? "place" : "places"}` : "—"}
                      </span>
                    ),
                  },
                  { label: "Hash", value: previewHash },
                  { label: "Duration", value: `${days} ${days === 1 ? "day" : "days"}` },
                ]}
              />
            </div>
            <p className="mt-4 font-mono text-[11px] leading-[1.5] text-[var(--dim)]">
              You fund the prizes from your own account.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Line({ k, v, gold, note }: { k: string; v: bigint; gold?: boolean; note?: string }) {
  return (
    <div>
      <p className="flex justify-between gap-4">
        <span className="text-[var(--dim)]">{k}</span>
        <span className={gold ? "text-[var(--gold)]" : ""}>{stroopsToXlm(v)} XLM</span>
      </p>
      {note && <p className="text-[11px] leading-[1.5] text-[var(--dim)]">{note}</p>}
    </div>
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
