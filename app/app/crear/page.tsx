"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TEMPLATES, type ChestTemplate } from "@/lib/templates";
import { answerToField, randomSalt } from "@/lib/answer";
import { poseidon2, fieldToHex } from "@/lib/zk";

export default function CreateChestPage() {
  const [tpl, setTpl] = useState<ChestTemplate>(TEMPLATES[2]);
  const [question, setQuestion] = useState(TEMPLATES[2].question);
  const [hint, setHint] = useState(TEMPLATES[2].hint);
  const [answer, setAnswer] = useState(TEMPLATES[2].answer);
  const [prize, setPrize] = useState(TEMPLATES[2].prize);
  const [maxClaims, setMaxClaims] = useState(TEMPLATES[2].maxClaims);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    chestId: number;
    link: string;
    widget: string;
    explorer: string | null;
  } | null>(null);

  const preview = useMemo(
    () => ({ question, hint, prize, maxClaims, name: tpl.name }),
    [question, hint, prize, maxClaims, tpl.name],
  );

  function pick(t: ChestTemplate) {
    setTpl(t);
    setQuestion(t.question);
    setHint(t.hint);
    setAnswer(t.answer);
    setPrize(t.prize);
    setMaxClaims(t.maxClaims);
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const salt = randomSalt();
      const fp = await poseidon2(answerToField(answer), salt);
      const fingerprintHex = fieldToHex(fp);

      const res = await fetch("/api/create-chest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprintHex,
          salt: salt.toString(),
          prize,
          maxClaims,
          deadline: 0,
          meta: { template: tpl.id, question, hint },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear");
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

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-10 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            Crear cofre
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            Elegí una plantilla
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t)}
              className={`rounded-2xl border p-4 text-left transition ${
                tpl.id === t.id
                  ? "border-primary"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <p className="font-semibold">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.blurb}</p>
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Pregunta">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="h-12 rounded-2xl"
              required
            />
          </Field>
          <Field label="Respuesta (nunca se publica)">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="h-12 rounded-2xl"
              required
            />
          </Field>
          <Field label="Pista (opcional)">
            <Input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Premio (CHEST)">
              <Input
                type="number"
                min={1}
                value={prize}
                onChange={(e) => setPrize(Number(e.target.value))}
                className="h-12 rounded-2xl"
              />
            </Field>
            <Field label="Cupos">
              <Input
                type="number"
                min={1}
                value={maxClaims}
                onChange={(e) => setMaxClaims(Number(e.target.value))}
                className="h-12 rounded-2xl"
              />
            </Field>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="h-12 rounded-full bg-primary font-semibold text-primary-foreground"
          >
            {busy ? "Desplegando…" : "Crear cofre en testnet"}
          </Button>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>

      <aside className="flex flex-col gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="font-mono text-xs text-muted-foreground">Vista previa</p>
          <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
            {preview.question}
          </h2>
          {preview.hint && (
            <p className="mt-2 text-sm text-muted-foreground">
              Pista: {preview.hint}
            </p>
          )}
          <p className="mt-4 font-mono text-2xl text-gold">
            {preview.prize} CHEST
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {preview.maxClaims} cupos · {preview.name}
          </p>
        </div>

        {result && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6">
            <p className="font-mono text-xs text-muted-foreground">
              Cofre #{result.chestId} listo
            </p>
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={result.link} size={160} />
            </div>
            <a
              href={result.link}
              className="break-all text-center text-sm text-[#4C8DFF] underline"
            >
              {result.link}
            </a>
            <pre className="w-full overflow-x-auto rounded-xl border border-border bg-background p-3 font-mono text-[11px] text-muted-foreground">
              {result.widget}
            </pre>
            <Link
              href={`/panel`}
              className="text-sm text-primary underline"
            >
              Ir al panel
            </Link>
          </div>
        )}
      </aside>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
