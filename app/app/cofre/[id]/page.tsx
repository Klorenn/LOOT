"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChestVisual } from "@/components/chest-visual";
import { DEMO_CHEST } from "@/lib/config";
import { loadPlayer } from "@/lib/wallet";

export default function ChestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const chest = DEMO_CHEST; // MVP: un cofre demo

  useEffect(() => {
    if (!loadPlayer()) {
      router.replace(`/entrar?next=/cofre/${id}`);
    }
  }, [id, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    sessionStorage.setItem(`chestzk.answer.${id}`, answer.trim());
    router.push(`/cofre/${id}/probando`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
      <ChestVisual size="sm" />

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
          Cofre #{id} · {chest.prizeLabel}
        </p>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.03em]">
          {chest.question}
        </h1>
        {chest.hint && (
          <p className="mt-2 text-sm text-muted-foreground">Pista: {chest.hint}</p>
        )}
        <p className="mt-4 font-mono text-2xl text-gold">{chest.prizeLabel}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            Tu respuesta
          </span>
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribila acá"
            className="h-12 rounded-2xl border-input bg-background text-base focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="off"
            autoFocus
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Tu respuesta nunca sale de este teléfono. Solo viaja una prueba ZK.
        </p>
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground"
        >
          Probar conocimiento
        </Button>
      </form>
    </main>
  );
}
