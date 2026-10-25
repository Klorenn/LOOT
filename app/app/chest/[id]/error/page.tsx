"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChestVisual } from "@/components/chest-visual";

function ErrorInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const code = params.get("code") || "generic";
  const raw = params.get("detail") || "";
  const COPY: Record<string, { title: string; detail: string }> = {
    wrong: {
      title: "Esa no es la respuesta",
      detail:
        "La huella de tu respuesta no coincide con la del cofre. Revisala e intentá de nuevo.",
    },
    claimed: {
      title: "Ya cobraste este cofre",
      detail: "Esta cuenta ya reclamó su cupo. Cada jugador cobra una sola vez.",
    },
    soldout: {
      title: "Se agotaron los cupos",
      detail: "Otros jugadores ya reclamaron todos los premios de este cofre.",
    },
    closed: {
      title: "Este cofre ya no está disponible",
      detail: "El cofre fue cerrado, venció o no existe en la red.",
    },
    notfound: {
      title: "Cofre no encontrado",
      detail: "No encontramos ese cofre. Revisá el enlace.",
    },
    generic: {
      title: "No se pudo completar el cobro",
      detail: "Hubo un problema de red o del servidor. Probá de nuevo en unos segundos.",
    },
  };
  const { title, detail } = COPY[code] ?? COPY.generic;
  const isUserError = code === "wrong" || code === "claimed" || code === "soldout";

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <ChestVisual size="sm" />
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p
          className={`mt-3 text-sm ${isUserError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {detail}
        </p>
        {raw && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
              detalle técnico
            </summary>
            <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
              {raw}
            </p>
          </details>
        )}
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
