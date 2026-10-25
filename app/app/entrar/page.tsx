"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enrollWithPasskey, loadPlayer } from "@/lib/wallet";

function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/cofre/1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = typeof window !== "undefined" ? loadPlayer() : null;

  async function go(fresh: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (fresh || !loadPlayer()) {
        await enrollWithPasskey();
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
          ChestZK
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
          Entra sin seed phrase
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Face ID crea tu cuenta inteligente. Cero comisiones para vos.
        </p>
      </div>

      <Button
        size="lg"
        disabled={busy}
        onClick={() => go(true)}
        className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground"
      >
        <ScanFace className="mr-2 size-5" aria-hidden />
        {busy ? "Creando cuenta…" : "Abrir con Face ID"}
      </Button>

      {existing && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => go(false)}
          className="h-12 w-full rounded-full border border-border"
        >
          Continuar con esta cuenta
        </Button>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

export default function EnterPage() {
  return (
    <Suspense>
      <EnterInner />
    </Suspense>
  );
}
