# Shared settings for the multi-party ceremony coordinator scripts. Sourced, not run.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CER="$ROOT/circuits/ceremony/multiparty-2026-12"
R1CS="$ROOT/circuits/build/chest.r1cs"
CACHE="${CEREMONY_CACHE:-$HOME/.cache/loot-ceremony}"
PTAU="$CACHE/powersOfTau28_hez_final_12.ptau"
PTAU_URL=https://circom.info/powersOfTau28_hez_final_12.ptau
PTAU_SHA256=dcf4ea473bf14b971ce5f7b7c1d6ce1c41a8ed042cdb75b65ca9178e3a3c7c17
R1CS_SHA256=c7696685542f119b8b37e748a23b3556181048cb4dadcab7fceef797505403d2
SNARKJS=(npx -y snarkjs@0.7.6)
ISSUE=https://github.com/Klorenn/LOOT/issues/4

# Beacon announced on the issue before any contribution.
DRAND_CHAIN=8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce
DRAND_ROUND=6685526
STELLAR_LEDGER=65750791

die() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
ok() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
name() { printf 'chest_%04d.zkey' "$1"; }

ensure_inputs() {
  mkdir -p "$CACHE"
  [ "$(sha "$R1CS")" = "$R1CS_SHA256" ] || die "chest.r1cs sha256 mismatch"
  if [ ! -f "$PTAU" ]; then curl -fL --progress-bar -o "$PTAU" "$PTAU_URL"; fi
  [ "$(sha "$PTAU")" = "$PTAU_SHA256" ] || die "ptau sha256 mismatch (delete $PTAU and retry)"
}

# zkey verify; prints the contribution list and fails unless it ends with "ZKey Ok!".
verify_zkey() {
  local out
  out=$("${SNARKJS[@]}" zkey verify "$R1CS" "$PTAU" "$1" 2>&1) || true
  printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g' | rg -i 'contribution #|beacon|ZKey Ok|invalid|error' || true
  printf '%s' "$out" | rg -q 'ZKey Ok!' || die "zkey verify failed for $1"
}
