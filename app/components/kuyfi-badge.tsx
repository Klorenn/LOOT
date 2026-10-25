import { getKuyfiSummary, type KuyfiCounts } from "@/lib/kuyfi";

const SEVERITIES: { key: keyof KuyfiCounts; label: string; color: string }[] = [
  { key: "critical", label: "Critical", color: "var(--red)" },
  { key: "high", label: "High", color: "var(--red)" },
  { key: "medium", label: "Medium", color: "var(--gold)" },
  { key: "low", label: "Low", color: "var(--muted)" },
  { key: "info", label: "Info", color: "var(--dim)" },
];

const WRAP =
  "inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--s1)] px-3 py-2 font-mono text-[12px] tracking-[0.04em]";

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-[6px] rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

/** Automated black-box scan result for a deployed contract. Not an audit. */
export async function KuyfiBadge({ contractId }: { contractId: string }) {
  const summary = await getKuyfiSummary(contractId);

  if (!summary) {
    return (
      <span className={WRAP} style={{ color: "var(--dim)" }}>
        <Dot color="var(--dim)" />
        Kuyfi scan · Not scanned yet
      </span>
    );
  }

  const date = summary.scannedAt.slice(0, 10);
  const { counts } = summary;
  const clean = counts !== null && SEVERITIES.every(({ key }) => counts[key] === 0);
  const dotColor = counts === null ? "var(--dim)" : clean ? "var(--ok)" : counts.critical + counts.high > 0 ? "var(--red)" : "var(--gold)";

  return (
    <span
      className={WRAP}
      title="Automated black-box scan with Kuyfi. Findings are signals for manual review, not an audit."
    >
      <span className="inline-flex items-center gap-2 text-[var(--text)]">
        <Dot color={dotColor} />
        Kuyfi scan
      </span>
      <time dateTime={summary.scannedAt} className="text-[var(--dim)]">
        {date}
      </time>

      {counts ? (
        <span className="inline-flex items-center gap-2">
          {SEVERITIES.map(({ key, label, color }) => (
            <span
              key={key}
              style={{ color: counts[key] > 0 ? color : "var(--dim)" }}
              aria-label={`${counts[key]} ${label}`}
            >
              {counts[key]} {label.slice(0, 4).toLowerCase()}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[var(--muted)]">
          {summary.functions} functions mapped · fuzzing pending
        </span>
      )}

      <a
        href={summary.reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--proof)] underline-offset-4 hover:underline"
      >
        Report ↗
      </a>
    </span>
  );
}
