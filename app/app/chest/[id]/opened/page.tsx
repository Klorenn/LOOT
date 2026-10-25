"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ChestVisual } from "@/components/chest-visual";

export default function OpenedPage() {
  const { id } = useParams<{ id: string }>();
  const [explorer, setExplorer] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState("");
  const [known, setKnown] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let hash = "";
    try {
      const raw = sessionStorage.getItem(`chestzk.claim.${id}`);
      if (raw) {
        const j = JSON.parse(raw);
        hash = j.hash || "";
        setExplorer(j.explorer || null);
      }
    } catch {
      /* ignore */
    }
    if (!hash) {
      setState("missing");
      return;
    }
    fetch(`/api/chests/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (cancelled) return;
        if (!meta) {
          setState("missing");
          return;
        }
        const target = Number(meta.prize) || 0;
        const unit = String(meta.prizeLabel || "").replace(/^[\d.,\s]+/, "");
        setLabel(unit);
        setKnown(Boolean(meta.prizeLabel));
        setState("ok");
        const start = performance.now();
        const dur = 600;
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          setAmount(target * p);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [id]);

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-muted-foreground">
        Cargando…
      </main>
    );
  }

  if (state === "missing") {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">No encontramos tu cobro.</p>
        <Link href={`/chest/${id}`} className="text-sm text-primary underline">
          Volver al cofre
        </Link>
        <Link href="/" className="text-sm text-muted-foreground underline">
          Inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <ChestVisual open />

      <div className="flex items-center gap-2 text-ok">
        <Check className="size-5" aria-hidden />
        <span className="font-mono text-sm tracking-[0.04em]">
          Prueba verificada
        </span>
      </div>

      <p className="font-mono text-5xl font-semibold text-gold">
        {known
          ? `${Number.isInteger(amount) ? amount : amount.toFixed(2)} ${label}`
          : "Premio enviado"}
      </p>

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
