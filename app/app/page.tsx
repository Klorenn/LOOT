import { Button } from "@/components/ui/button";

const counters = [
  { label: "cofres abiertos", value: "0" },
  { label: "copias rechazadas", value: "0" },
  { label: "USDC pagado", value: "0.00" },
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

      {/* Placeholder del cofre: glow radial lila, sin imágenes ni sombras */}
      <div
        className="relative flex h-56 w-full max-w-md items-center justify-center rounded-2xl border border-border"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 55%, rgba(223, 185, 224, 0.18), transparent 70%), var(--surface)",
        }}
      >
        <span className="font-mono text-xs text-muted-foreground">
          [ cofre ]
        </span>
      </div>

      <Button
        size="lg"
        className="h-12 w-full max-w-md rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
      >
        Abrir un cofre
      </Button>

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
