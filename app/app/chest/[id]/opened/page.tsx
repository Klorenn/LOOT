"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ChestVisual } from "@/components/chest-visual";
import { DEMO_CHEST } from "@/lib/config";

export default function OpenedPage() {
  const { id } = useParams<{ id: string }>();
  const [explorer, setExplorer] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    const raw = sessionStorage.getItem(`chestzk.claim.${id}`);
    if (raw) {
      try {
        const j = JSON.parse(raw);
        setExplorer(j.explorer || null);
      } catch {
        /* ignore */
      }
    }
    // contador del premio
    const target = DEMO_CHEST.prize;
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setAmount(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <ChestVisual open />

      <div className="flex items-center gap-2 text-ok">
        <Check className="size-5" aria-hidden />
        <span className="font-mono text-sm tracking-[0.04em]">
          Prueba verificada
        </span>
      </div>

      <p className="font-mono text-5xl font-semibold text-gold">{amount} CHEST</p>

      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#4C8DFF] underline"
        >
          Ver en el explorador
        </a>
      )}

      <Link
        href="/"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
      >
        Compartir / Inicio
      </Link>
    </main>
  );
}
