"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { KeyRound, ScanFace, Wallet, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_CHEST } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { useSession, type ConnectMethod } from "@/lib/session";
import { PasskeyUnavailableError } from "@/lib/wallet";

function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || `/chest/${DEMO_CHEST.id}`;
  const { player, connect } = useSession();
  const [busy, setBusy] = useState<ConnectMethod | "continue" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(method: ConnectMethod) {
    setBusy(method);
    setError(null);
    try {
      await connect(method);
      router.push(next);
    } catch (e) {
      if (e instanceof PasskeyUnavailableError) {
        setError(
          "Este dispositivo no tiene WebAuthn / Face ID. Conectá una wallet Stellar o usá “Demo sin passkey”.",
        );
      } else {
        setError(
          e instanceof Error
            ? e.message
            : (e as { message?: string })?.message || String(e),
        );
      }
      setBusy(null);
    }
  }

  // La sesión guardada ya trae keyId / walletId: no hay nada que volver a crear.
  function goContinue() {
    router.push(next);
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
        onClick={() => void go("passkey")}
        className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground"
      >
        <ScanFace className="mr-2 size-5" aria-hidden />
        {busy === "passkey"
          ? "Esperando passkey…"
          : player?.kind === "passkey"
            ? "Abrir con Face ID / passkey"
            : "Crear wallet con Face ID / passkey"}
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
        variant="secondary"
        disabled={!!busy}
        onClick={() => void go("wallet")}
        className="h-12 w-full rounded-full border border-border"
      >
        <WalletCards className="mr-2 size-5" aria-hidden />
        {busy === "wallet" ? "Esperando wallet…" : "Conectar wallet Stellar (G…)"}
      </Button>

      <Button
        variant="ghost"
        disabled={!!busy}
        onClick={() => void go("passkey-existing")}
        className="h-11 w-full text-muted-foreground"
      >
        <KeyRound className="mr-2 size-4" aria-hidden />
        {busy === "passkey-existing" ? "Buscando passkey…" : "Ya tengo una passkey de ChestZK"}
      </Button>

      <Button
        variant="ghost"
        disabled={!!busy}
        onClick={() => void go("demo")}
        className="h-11 w-full text-muted-foreground"
      >
        <Wallet className="mr-2 size-4" aria-hidden />
        {busy === "demo" ? "Fondeando cuenta demo…" : "Demo sin passkey (G…)"}
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
