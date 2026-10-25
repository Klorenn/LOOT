import Link from "next/link";
import { ChestVisual } from "@/components/chest-visual";
import { DEMO_CHEST } from "@/lib/config";

const counters = [
  { label: "cofres abiertos", value: "1" },
  { label: "copias rechazadas", value: "0" },
  { label: "CHEST pagado", value: "100" },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">
          ChestZK
        </h1>
        <p className="text-muted-foreground">Saber cuenta. Copiar, no.</p>
      </div>

      <ChestVisual />

      <Link
        href={`/entrar?next=/cofre/${DEMO_CHEST.id}`}
        className="inline-flex h-12 w-full max-w-md items-center justify-center rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Abrir un cofre
      </Link>

      <dl className="grid w-full max-w-md grid-cols-3 gap-4 text-center">
        {counters.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <dd className="font-mono text-2xl text-foreground">{value}</dd>
            <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
    </main>
  );
}
