"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChestVisual } from "@/components/chest-visual";

function ErrorInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const raw = params.get("reason") || "No se pudo abrir el cofre";
  const isCopy = /nullifier/i.test(raw);
  const isWrong = /invalid.?proof/i.test(raw);
  const title = isCopy
    ? "Copia rechazada"
    : isWrong
      ? "Respuesta incorrecta"
      : "No fue esta vez";
  const detail = isCopy
    ? "Ese nullifier ya se usó. Una prueba no se puede reenviar a otra cuenta."
    : isWrong
      ? "La huella no coincide con el cofre. Revisá la respuesta e intentá de nuevo."
      : raw;

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <ChestVisual size="sm" />
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p
          className={`mt-3 text-sm ${isCopy || isWrong ? "text-destructive" : "text-muted-foreground"}`}
        >
          {detail}
        </p>
      </div>
      <Link
        href={`/chest/${id}`}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
      >
        Probar de nuevo
      </Link>
      <Link href="/" className="text-sm text-muted-foreground underline">
        Probar otro cofre
      </Link>
    </main>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorInner />
    </Suspense>
  );
}
