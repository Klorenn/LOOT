export function KV({
  rows,
}: {
  rows: { label: string; value: React.ReactNode; valueClass?: string }[];
}) {
  return (
    <dl className="border-t border-[var(--line)]">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[160px_1fr] items-baseline gap-4 border-b border-[var(--line)] py-3"
        >
          <dt className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
            {r.label}
          </dt>
          <dd
            className={`font-mono text-[13.5px] text-[var(--text)] ${r.valueClass || ""}`}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const short =
    children.length > 12
      ? `${children.slice(0, 4)}…${children.slice(-4)}`
      : children;
  return (
    <span className={`font-mono text-[13px] ${className}`} title={children}>
      {short}
    </span>
  );
}
