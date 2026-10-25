"use client";

import { useEffect, useMemo, useState } from "react";
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

const STEPS = [
  "Puzzle",
  "Answer hash",
  "Reward",
  "Expiry",
  "Review & fund",
] as const;

export default function CreateChestPage() {
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<ChestTemplate>(TEMPLATES[2]);
  const [question, setQuestion] = useState(TEMPLATES[2].question);
  const [hint, setHint] = useState(TEMPLATES[2].hint);
  const [answer, setAnswer] = useState("");
  const [hashHex, setHashHex] = useState<string | null>(null);
  const [hashOk, setHashOk] = useState(false);
  const [prize, setPrize] = useState(TEMPLATES[2].prize);
  const [difficulty, setDifficulty] = useState(2);
  const [expires, setExpires] = useState("");
  const [maxClaims, setMaxClaims] = useState(TEMPLATES[2].maxClaims);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    chestId: number;
    link: string;
    widget: string;
    explorer: string | null;
  } | null>(null);

  useEffect(() => {
    if (!expires) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setExpires(d.toISOString().slice(0, 16));
    }
  }, [expires]);

  async function hashAnswer() {
    const n = normalizeAnswer(answer);
    if (!n) {
      setHashHex(null);
      setHashOk(false);
      return;
    }
    const salt = BigInt(7);
    const fp = await poseidon2(answerToField(n), salt);
    setHashHex(fieldToHex(fp));
    setHashOk(true);
    setFieldErr((e) => ({ ...e, answer: "" }));
  }

  function pick(t: ChestTemplate) {
    setTpl(t);
    setQuestion(t.question);
    setHint(t.hint);
    setAnswer("");
    setPrize(t.prize);
    setMaxClaims(t.maxClaims);
    setHashHex(null);
    setHashOk(false);
    setResult(null);
  }

  function validateStep(): boolean {
    const e: Record<string, string> = {};
    if (step === 0 && !question.trim()) e.question = "Puzzle text is required.";
    if (step === 1 && !hashOk) e.answer = "Enter an answer; it's hashed on this device when you leave the field.";
    if (step === 2 && prize < 1) e.prize = "Reward must be ≥ 1.";
    if (step === 3 && !expires) e.expires = "Pick an expiry.";
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
    setBusy(true);
    setError(null);
    try {
      const salt = randomSalt();
      const n = normalizeAnswer(answer);
      const fp = await poseidon2(answerToField(n), salt);
      const fingerprintHex = fieldToHex(fp);
      const deadline = Math.floor(new Date(expires).getTime() / 1000) || 0;

      let adminKey = sessionStorage.getItem("chestzk.adminKey") || "";
      if (!adminKey) {
        adminKey = window.prompt("Admin key") || "";
        if (adminKey) sessionStorage.setItem("chestzk.adminKey", adminKey);
      }
      const res = await fetch("/api/create-chest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          fingerprintHex,
          salt: salt.toString(),
          prize,
          maxClaims,
          deadline,
          meta: {
            template: tpl.id,
            question,
            hint,
            difficulty,
          },
        }),
      });
      const data = await res.json();
      if (res.status === 403) {
        sessionStorage.removeItem("chestzk.adminKey");
        throw new Error("Invalid admin key (403)");
      }
      if (!res.ok) throw new Error(data.error || "Could not create");
      setResult({
        chestId: data.chestId,
        link: data.link,
        widget: data.widget,
        explorer: data.explorer,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
          lead="Share the link. Solvers prove in-browser; only the hash sits on-chain."
        />
        <div className="mx-auto flex max-w-[480px] flex-col items-center gap-6 px-6 py-12">
          <div className="rounded-[14px] bg-white p-3">
            <QRCodeSVG value={result.link} size={160} />
          </div>
          <a
            href={result.link}
            className="break-all text-center text-sm text-[var(--proof)] underline"
          >
            {result.link}
          </a>
          <div className="flex flex-wrap gap-3">
            <Link href={chestPath(result.chestId)} className="btn-landing btn-landing-p">
              Open chest →
            </Link>
            <Link href="/dashboard" className="btn-landing btn-landing-s">
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        eyebrow={`New chest · step ${step + 1} of ${STEPS.length}`}
        title={
          <>
            Create a <Em>chest</Em>
          </>
        }
        lead="Escrow a prize behind a riddle. Only the hash of the answer goes on-chain."
      />

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
                    hint="Public on-chain metadata"
                    error={fieldErr.question}
                  >
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
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

              {step === 1 && (
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

              {step === 2 && (
                <>
                  <Field
                    label="Reward (XLM / units)"
                    hint="Escrowed in the contract"
                    error={fieldErr.prize}
                  >
                    <Input
                      type="number"
                      min={1}
                      value={prize}
                      onChange={(e) => setPrize(Number(e.target.value))}
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
                    hint="Unclaimed prize returns to you after expiry."
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
                  >
                    <Input
                      type="number"
                      min={1}
                      value={maxClaims}
                      onChange={(e) => setMaxClaims(Number(e.target.value))}
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
                  <p className="text-[var(--dim)]">
                    Deploy cost covered by relayer on testnet.
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
                disabled={busy}
                className="btn-landing btn-landing-p"
              >
                {busy ? "Funding…" : "Fund & create chest"}
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
              {tpl.name}
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
              Deploy cost covered by relayer on testnet.
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
