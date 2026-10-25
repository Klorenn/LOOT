const LABELS = ["Easy", "Medium", "Hard", "Brutal"] as const;

export function DifficultyBars({ level }: { level: 1 | 2 | 3 | 4 }) {
  const color =
    level <= 2 ? "var(--ok)" : level === 3 ? "var(--gold)" : "var(--red)";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-[14px] w-[6px]"
            style={{
              background: i <= level ? color : "var(--line)",
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[12px] text-[var(--dim)]">
        {LABELS[level - 1]}
      </span>
    </span>
  );
}
