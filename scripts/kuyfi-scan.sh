#!/usr/bin/env bash
# Scan a Soroban testnet contract with Kuyfi and publish the report for the app badge.
#
#   scripts/kuyfi-scan.sh <CONTRACT_ID>                 OSINT only (read-only, no transactions)
#   scripts/kuyfi-scan.sh <CONTRACT_ID> --chaos         OSINT + Chaos Monkey (SENDS testnet transactions)
#   scripts/kuyfi-scan.sh --all                         OSINT every contract id in app/lib/config.ts
#   scripts/kuyfi-scan.sh --import <kuyfi-report.json> [report.pdf]
#                                                       Publish a report you already generated
#
# Output (the badge reads app/public/..., the rest is the canonical copy):
#   security/kuyfi/<id>.osint.json              OSINT surface map (no findings)
#   security/kuyfi/<id>.json  (+ <id>.pdf)      Chaos Monkey SecurityReport (kuyfi --json --pdf)
#   app/public/security/kuyfi/<same names>      copies served by the app / read by lib/kuyfi.ts
#
# Kuyfi v0.1.0 limits that shape this script (source: github.com/alex0tico/kuyfi):
#   - Testnet only; there is no --network flag (source/modules/network.ts).
#   - No OSINT-only CLI flag: `kuyfi <id>` always fuzzes (source/modules/audit.ts), so OSINT
#     goes through scripts/kuyfi-osint.mjs, which calls the scanner module directly.
#   - Chaos Monkey cannot use a chosen identity: it generates a random keypair and funds it
#     with Friendbot on every run (chaos_monkey/keypair_factory.ts). No account is reused.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/security/kuyfi"
PUB="$ROOT/app/public/security/kuyfi"
mkdir -p "$OUT" "$PUB"

die() { echo "error: $*" >&2; exit 1; }

sync_public() { # copy every report of this contract id into the app's public dir
  local id="$1" f
  for f in "$OUT/$id.json" "$OUT/$id.pdf" "$OUT/$id.osint.json"; do
    [[ -f "$f" ]] && cp "$f" "$PUB/$(basename "$f")"
  done
  return 0
}

# ---- --import ---------------------------------------------------------------
if [[ "${1:-}" == "--import" ]]; then
  src="${2:-}"; [[ -f "$src" ]] || die "usage: kuyfi-scan.sh --import <report.json> [report.pdf]"
  id="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    if(!r.target?.contractId||!r.summary?.bySeverity) process.exit(1); console.log(r.target.contractId)' "$src")" \
    || die "$src is not a Kuyfi SecurityReport with a Chaos Monkey summary"
  cp "$src" "$OUT/$id.json"
  [[ -n "${3:-}" && -f "${3:-}" ]] && cp "$3" "$OUT/$id.pdf"
  sync_public "$id"
  echo "imported $id"
  exit 0
fi

# ---- --all: OSINT every contract id currently in app/lib/config.ts --------------
# Picks up whatever CONTRACTS / NORMAL_CHEST point to at run time (read-only, never fuzzes).
if [[ "${1:-}" == "--all" ]]; then
  text="$(<"$ROOT/app/lib/config.ts")"; seen=" "; rc=0
  while [[ "$text" =~ (C[A-Z0-9]{55}) ]]; do
    cid="${BASH_REMATCH[1]}"; text="${text#*"$cid"}"
    [[ "$seen" == *" $cid "* ]] && continue
    seen+="$cid "
    r=0; "$0" "$cid" || r=$?
    [[ $r -eq 0 || $r -eq 3 ]] || { echo "failed: $cid" >&2; rc=1; }
  done
  exit $rc
fi

ID="${1:-}"; MODE="${2:-}"
[[ "$ID" =~ ^C[A-Z0-9]{55}$ ]] || die "usage: kuyfi-scan.sh <CONTRACT_ID> [--chaos]"
[[ -z "$MODE" || "$MODE" == "--chaos" ]] || die "unknown option: $MODE"

# ---- OSINT (always; read-only) -------------------------------------------------
# Exit 3 = Stellar Asset Contract, excluded on purpose (not a failure).
osint_rc=0
node "$ROOT/scripts/kuyfi-osint.mjs" "$ID" "$OUT/$ID.osint.json" || osint_rc=$?
[[ $osint_rc -eq 3 ]] && exit 3
[[ $osint_rc -eq 0 ]] || exit "$osint_rc"

# ---- Chaos Monkey (opt-in; broadcasts testnet transactions) --------------------
if [[ "$MODE" == "--chaos" ]]; then
  command -v kuyfi >/dev/null || die "kuyfi not found: npm install -g @kuyfi/kuyfi"
  # Never fuzz the live demo contracts (they hold funds). Use a throwaway deployment.
  if [[ "${KUYFI_ALLOW_LIVE:-}" != "1" && "$(<"$ROOT/app/lib/config.ts")" == *"$ID"* ]]; then
    die "$ID is referenced in app/lib/config.ts (live contract). Deploy a throwaway copy, or set KUYFI_ALLOW_LIVE=1 if you really mean it."
  fi
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  # kuyfi writes kuyfi-report-<reportId>.{json,pdf} into the cwd and refuses to overwrite.
  # Exit code 1 means tool failure, not findings (cli_runtime.ts), so a failed run is fatal here.
  (cd "$tmp" && kuyfi "$ID" --json --pdf)
  json=("$tmp"/kuyfi-report-*.json); pdf=("$tmp"/kuyfi-report-*.pdf)
  [[ -f "${json[0]}" ]] || die "kuyfi produced no JSON report"
  cp "${json[0]}" "$OUT/$ID.json"
  [[ -f "${pdf[0]}" ]] && cp "${pdf[0]}" "$OUT/$ID.pdf"
fi

sync_public "$ID"
echo "reports in $OUT (copied to app/public/security/kuyfi)"
