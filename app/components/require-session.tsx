"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useSession } from "@/lib/session";

function Guard({ children }: { children: React.ReactNode }) {
  const { ready, address } = useSession();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!ready || address) return;
    const here = search ? `${path}?${search}` : path;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [ready, address, router, path, search]);

  if (!ready || !address) {
    // Mismo alto que una página real para no saltar; sin contenido hasta confirmar la sesión.
    return <main className="min-h-[70vh]" aria-busy />;
  }
  return <>{children}</>;
}

/** Protege una ruta: sin sesión redirige a /login?next=<ruta+query> (solo cliente, sin backend). */
export function RequireSession({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="min-h-[70vh]" aria-busy />}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
