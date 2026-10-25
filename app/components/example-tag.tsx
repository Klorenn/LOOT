/** Gold ◆ label for sample / placeholder numbers (never pretend live chain data). */
export function ExampleTag({
  children = "example",
}: {
  children?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.1em] text-[var(--gold)] uppercase">
      <span aria-hidden>◆</span>
      {children}
    </span>
  );
}
