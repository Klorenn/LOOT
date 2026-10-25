"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ScanFace, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_CHEST } from "@/lib/config";
import {
  clearPlayer,
  enrollClassic,
  enrollWithPasskey,
  loadPlayer,
  PasskeyUnavailableError,
  type Player,
} from "@/lib/wallet";

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || `/chest/${DEMO_CHEST.id}`;
  const [busy, setBusy] = useState<"passkey" | "classic" | "continue" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(() =>
    typeof window !== "undefined" ? loadPlayer() : null,
  );

  async function goPasskey() {
    setBusy("passkey");
    setError(null);
    try {
      clearPlayer();
      const p = await enrollWithPasskey();
      setPlayer(p);
      router.push(next);
    } catch (e) {
      if (e instanceof PasskeyUnavailableError) {
        setError(
          "Este dispositivo no tiene WebAuthn / Face ID. Usá “Demo sin passkey”.",
        );
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
      setBusy(null);
    }
  }

  async function goClassic() {
    setBusy("classic");
    setError(null);
    try {
      clearPlayer();
      const p = await enrollClassic();
      setPlayer(p);
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function goContinue() {
    setBusy("continue");
    setError(null);
    try {
      const existing = loadPlayer();
      if (!existing) {
        await goPasskey();
        return;
      }
      // Re-verify passkey wallets (prompts biometric when needed)
      if (existing.kind === "passkey") {
        const p = await enrollWithPasskey();
        setPlayer(p);
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
          ChestZK
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
          Entra sin seed phrase
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Passkey despliega tu smart wallet en Stellar (C…). Las fees las
          cubre el relayer. El claim lo firma el relayer; tu dirección es el
          receptor de la prueba ZK.
        </p>
      </div>

      <Button
        size="lg"
        disabled={!!busy}
        onClick={goPasskey}
        className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground"
      >
        <ScanFace className="mr-2 size-5" aria-hidden />
        {busy === "passkey"
          ? "Creando smart wallet…"
          : "Abrir con Face ID / passkey"}
      </Button>

      {player && (
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={goContinue}
          className="h-12 w-full rounded-full border border-border"
        >
          Continuar · {player.kind === "passkey" ? "C…" : "G…"}{" "}
          {shortAddr(player.publicKey)}
        </Button>
      )}

      <Button
        variant="ghost"
        disabled={!!busy}
        onClick={goClassic}
        className="h-11 w-full text-muted-foreground"
      >
        <Wallet className="mr-2 size-4" aria-hidden />
        {busy === "classic"
          ? "Fondeando cuenta demo…"
          : "Demo sin passkey (G…)"}
      </Button>

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
