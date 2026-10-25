import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Loader for the Kuyfi scan reports written by `scripts/kuyfi-scan.sh`.
 * Reads the REAL report JSON from `public/security/kuyfi/` (inside the Next.js
 * root, so it ships with the deploy). Nothing here is hardcoded: no report file
 * means `null`, and an OSINT-only file never yields severity counts.
 */

/**
 * Where reports are linked from. "#" is a placeholder until the public repo URL
 * exists; set it to e.g. "https://github.com/<org>/<repo>/blob/main" and
 * `reportUrl` will point at `<base>/security/kuyfi/<id>.json` instead of the
 * copy served by the app itself.
 */
export const KUYFI_REPORTS_GITHUB_BASE = "#";

const PUBLIC_DIR = "security/kuyfi";
const CONTRACT_ID_RE = /^C[A-Z0-9]{55}$/;

export interface KuyfiCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface KuyfiSummary {
  /** "chaos": full run (OSINT + Chaos Monkey), counts are real. "osint": surface map only. */
  mode: "chaos" | "osint";
  /** ISO timestamp, `generatedAt` of the report. */
  scannedAt: string;
  /** Findings by severity. `null` for OSINT-only reports (fuzzing has not run: unknown, not zero). */
  counts: KuyfiCounts | null;
  /** Functions mapped by the OSINT scanner. */
  functions: number;
  reportUrl: string;
}

interface RawReport {
  generatedAt?: unknown;
  mode?: unknown;
  scan?: { totalFunctions?: unknown };
  summary?: { bySeverity?: Record<string, unknown> };
}

const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

async function readReport(file: string): Promise<RawReport | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", PUBLIC_DIR, file), "utf8");
    return JSON.parse(raw) as RawReport;
  } catch {
    // Not in the function bundle (e.g. served only from the CDN): fetch the public copy.
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    if (!host) return null;
    try {
      const res = await fetch(`https://${host}/${PUBLIC_DIR}/${file}`, {
        next: { revalidate: 300 },
      });
      return res.ok ? ((await res.json()) as RawReport) : null;
    } catch {
      return null;
    }
  }
}

function toSummary(
  raw: RawReport,
  file: string,
  chaos: boolean,
): KuyfiSummary | null {
  if (typeof raw.generatedAt !== "string") return null;
  const functions = raw.scan?.totalFunctions;
  if (!isCount(functions)) return null;

  let counts: KuyfiCounts | null = null;
  if (chaos) {
    const s = raw.summary?.bySeverity;
    if (!s || !isCount(s.critical) || !isCount(s.high) || !isCount(s.medium) || !isCount(s.low) || !isCount(s.info)) {
      return null;
    }
    counts = { critical: s.critical, high: s.high, medium: s.medium, low: s.low, info: s.info };
  }

  const reportUrl =
    KUYFI_REPORTS_GITHUB_BASE === "#"
      ? `/${PUBLIC_DIR}/${file}`
      : `${KUYFI_REPORTS_GITHUB_BASE}/${PUBLIC_DIR}/${file}`;
  return {
    mode: chaos ? "chaos" : "osint",
    scannedAt: raw.generatedAt,
    counts,
    functions,
    reportUrl,
  };
}

/** Latest Kuyfi result for a contract: Chaos Monkey report if present, else OSINT, else `null`. */
export async function getKuyfiSummary(contractId: string): Promise<KuyfiSummary | null> {
  if (!CONTRACT_ID_RE.test(contractId)) return null; // also blocks path traversal

  const chaosFile = `${contractId}.json`;
  const chaos = await readReport(chaosFile);
  if (chaos) {
    const s = toSummary(chaos, chaosFile, true);
    if (s) return s;
  }

  const osintFile = `${contractId}.osint.json`;
  const osint = await readReport(osintFile);
  return osint ? toSummary(osint, osintFile, false) : null;
}
