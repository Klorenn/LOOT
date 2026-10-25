const MAP = {
  open: { color: "var(--ok)", label: "Open" },
  claimed: { color: "var(--proof)", label: "Claimed" },
  expired: { color: "var(--dim)", label: "Expired" },
  draft: { color: "var(--gold)", label: "Draft" },
} as const;

export function StatusLabel({
  status,
}: {
  status: keyof typeof MAP;
}) {
  const s = MAP[status];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] tracking-[0.04em]">
      <span
        className="inline-block size-[6px] rounded-full"
        style={{ background: s.color }}
        aria-hidden
      />
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  );
}
