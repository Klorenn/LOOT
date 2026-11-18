#!/usr/bin/env bash
# Loot · deploy of the Groth16 VERIFIER contract (contracts/verifier-mainnet) built from a ceremony verification key.
#
# The verifier is stateless: no constructor, no admin, no storage. It only holds the vk as constants.
# After this succeeds, deploy the registry against the record it writes (scripts/mainnet/deploy-registry.sh,
# VERIFIER_RECORD=deployments/verifier-mainnet.json).
#
# DRY-RUN BY DEFAULT. Nothing is signed or sent unless you pass --execute.
#   scripts/mainnet/deploy-verifier.sh                 # dry-run: ceremony checks + simulate upload + budget table
#   scripts/mainnet/deploy-verifier.sh --execute       # really send (spends XLM)
#
# Env:
#   NETWORK                 mainnet (default) | testnet
#   SOURCE                  stellar identity name that pays and signs (G... pubkey allowed in dry-run only)
#   SIM_SOURCE_ADDRESS      any funded G... address on NETWORK, used ONLY to simulate when SOURCE is unfunded/a bare key
#   CEREMONY_DIR            dir with verification_key.json (default circuits/ceremony/multiparty-2026-12)
#   MANIFEST                manifest of the verifier crate being deployed (default contracts/verifier-mainnet/verifier-manifest.json);
#                           its vk_sha256 is what vk_fingerprint() must return on-chain.
#   RELEASE_TAG             GitHub release from .github/workflows/release-wasm.yml holding the chestzk-verifier wasm.
#                           REQUIRED with --execute on mainnet: the wasm is downloaded from that release and its build
#                           attestation is checked (gh attestation verify). RELEASE_REPO defaults to Klorenn/LOOT.
#   WASM_DIR                dry-run and testnet only: dir with chestzk_verifier.wasm; else, without RELEASE_TAG, built
#                           locally from contracts/verifier-mainnet (needs rustup rustc). Refused with --execute on mainnet.
#   SKIP_VK_REGEN=1         mainnet --execute normally REQUIRES the soroban-verifier-gen binary (0.4.3) to re-derive
#                           vk_sha256 from CEREMONY_DIR/verification_key.json and compare it with MANIFEST. Set this only
#                           if you verified the manifest against the vk some other way.
#   HARD_CAP_XLM            default 40
#   RPC_URL / HORIZON_URL   defaults per NETWORK (mainnet.sorobanrpc.com + horizon.stellar.org / testnet equivalents)
#
# Record: deployments/verifier-mainnet.json (never overwritten). Testnet: deployments/verifier-testnet-<UTC time>.json.
set -euo pipefail

EXECUTE=0
for a in "$@"; do
  case "$a" in
    --execute) EXECUTE=1 ;;
    -h|--help) sed -n 2,30p "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done

die()  { echo "REFUSING: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
step() { echo; echo "== $* =="; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1"; }
xlm()  { awk -v s="$1" 'BEGIN{printf "%.4f", s/10000000}'; }
add()  { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", a+b}'; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"   # Homebrew rustc 1.90 shadows rustup 1.99

NETWORK="${NETWORK:-mainnet}"
case "$NETWORK" in
  mainnet)
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    RPC_URL="${RPC_URL:-https://mainnet.sorobanrpc.com}"
    HORIZON_URL="${HORIZON_URL:-https://horizon.stellar.org}" ;;
  testnet)
    PASSPHRASE="Test SDF Network ; September 2015"
    RPC_URL="${RPC_URL:-https://soroban-testnet.stellar.org}"
    HORIZON_URL="${HORIZON_URL:-https://horizon-testnet.stellar.org}" ;;
  *) die "NETWORK must be mainnet or testnet (got '$NETWORK')" ;;
esac
export NETWORK_PASSPHRASE="$PASSPHRASE"   # read by simulate-tx.mjs

RELEASE_REPO="${RELEASE_REPO:-Klorenn/LOOT}"
RELEASE_TAG="${RELEASE_TAG:-}"
# Checked BEFORE any network call: mainnet only ever gets the CI-built, attested release wasm.
if [ "$NETWORK" = mainnet ] && [ "$EXECUTE" = 1 ]; then
  [ -n "$RELEASE_TAG" ] || die "--execute on mainnet needs RELEASE_TAG (deploy only the CI-built release wasm, never a local build)"
  [ -z "${WASM_DIR:-}" ] || die "WASM_DIR is not allowed with --execute on mainnet (use RELEASE_TAG)"
fi

HARD_CAP_XLM="${HARD_CAP_XLM:-40}"
CEREMONY_DIR="${CEREMONY_DIR:-circuits/ceremony/multiparty-2026-12}"
MANIFEST="${MANIFEST:-contracts/verifier-mainnet/verifier-manifest.json}"
if [ "$NETWORK" = mainnet ]; then
  OUT_JSON="deployments/verifier-mainnet.json"
else
  OUT_JSON="deployments/verifier-testnet-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
OUT_DIR="${WASM_DIR:-$ROOT/.build-verifier-$NETWORK}"
EST_DEPLOY=0.5   # deploy of a stateless instance (no constructor): small
BUD_UP=20.0      # per-item warning budget for the wasm upload

need stellar; need jq; need curl; need shasum; need node; need rg; need fd

[ "$EXECUTE" = 1 ] && echo "MODE: EXECUTE (real $NETWORK transactions)" || echo "MODE: DRY-RUN (nothing is signed or sent; pass --execute to send)"

# ---------------------------------------------------------------- ceremony inputs (local files only)
step "ceremony inputs"
VK_FILE="$CEREMONY_DIR/verification_key.json"
[ -f "$VK_FILE" ] || die "missing $VK_FILE (run scripts/ceremony/finalize.sh first)"
[ -f "$MANIFEST" ] || die "missing $MANIFEST"
VK_FILE_SHA="$(shasum -a 256 "$VK_FILE" | awk '{print $1}')"
echo "  $VK_FILE sha256: $VK_FILE_SHA"
if [ -f "$CEREMONY_DIR/SHA256SUMS" ]; then
  PINNED="$(rg '^([0-9a-f]{64})  verification_key\.json$' -r '$1' "$CEREMONY_DIR/SHA256SUMS" | tail -1 || true)"
  if [ -n "$PINNED" ]; then
    [ "$PINNED" = "$VK_FILE_SHA" ] || die "verification_key.json sha256 $VK_FILE_SHA != $CEREMONY_DIR/SHA256SUMS ($PINNED)"
    echo "  matches $CEREMONY_DIR/SHA256SUMS OK"
  else
    warn "$CEREMONY_DIR/SHA256SUMS has no verification_key.json entry"
  fi
else
  warn "no $CEREMONY_DIR/SHA256SUMS to compare against"
fi
MANIFEST_FP="$(jq -r '.vk_sha256 // empty' "$MANIFEST")"
[[ "$MANIFEST_FP" =~ ^[0-9a-f]{64}$ ]] || die "no valid vk_sha256 in $MANIFEST"
echo "  manifest vk_sha256 : $MANIFEST_FP ($MANIFEST)"
# vk_sha256 is computed by the generator over the parsed vk (not the raw file bytes): re-derive it when we can.
if command -v soroban-verifier-gen >/dev/null 2>&1; then
  GEN_OUT="$(mktemp -d)/gen"
  soroban-verifier-gen --vk "$VK_FILE" --out "$GEN_OUT" --crate-name chestzk-verifier >/dev/null 2>&1 \
    || die "soroban-verifier-gen failed on $VK_FILE"
  GEN_FP="$(jq -r '.vk_sha256 // empty' "$GEN_OUT/verifier-manifest.json")"
  [ "$GEN_FP" = "$MANIFEST_FP" ] || die "fresh soroban-verifier-gen vk_sha256 $GEN_FP != $MANIFEST ($MANIFEST_FP): the verifier crate was not generated from $VK_FILE"
  echo "  fresh soroban-verifier-gen run on $VK_FILE gives the same vk_sha256 OK"
elif [ "$NETWORK" = mainnet ] && [ "$EXECUTE" = 1 ] && [ "${SKIP_VK_REGEN:-0}" != 1 ]; then
  die "soroban-verifier-gen not installed: cannot prove $MANIFEST comes from $VK_FILE (cargo install --locked soroban-verifier-gen --version 0.4.3, or SKIP_VK_REGEN=1)"
else
  warn "soroban-verifier-gen not installed: manifest vk_sha256 NOT re-derived from $VK_FILE"
fi

# ---------------------------------------------------------------- preflight
step "preflight"
[ -n "${SOURCE:-}" ] || die "SOURCE (stellar identity name) is required"
RPC_PASS="$(curl -fsS -X POST "$RPC_URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getNetwork"}' | jq -r '.result.passphrase')" || die "RPC $RPC_URL unreachable"
[ "$RPC_PASS" = "$PASSPHRASE" ] || die "RPC passphrase mismatch: '$RPC_PASS' (must be $NETWORK: '$PASSPHRASE')"
echo "  network : $NETWORK ($RPC_URL) OK"

if [[ "$SOURCE" =~ ^G[A-Z2-7]{55}$ ]]; then
  [ "$EXECUTE" = 0 ] || die "--execute needs SOURCE to be an identity name (stellar keys), not a bare public key"
  SOURCE_ADDR="$SOURCE"
else
  SOURCE_ADDR="$(stellar keys address "$SOURCE")" || die "identity '$SOURCE' not found"
fi
horizon_bal() { curl -fsS "$HORIZON_URL/accounts/$1" 2>/dev/null | jq -r '[.balances[]|select(.asset_type=="native")][0].balance // empty' || true; }
BAL="$(horizon_bal "$SOURCE_ADDR")"
SIM_ADDR="$SOURCE_ADDR"
if [ -z "$BAL" ]; then
  [ "$EXECUTE" = 0 ] || die "source account $SOURCE_ADDR not funded on $NETWORK (or Horizon unreachable)"
  [ -n "${SIM_SOURCE_ADDRESS:-}" ] || die "source $SOURCE_ADDR not funded on $NETWORK; set SIM_SOURCE_ADDRESS=<funded G...> to simulate in dry-run"
  SIM_ADDR="$SIM_SOURCE_ADDRESS"
  SB="$(horizon_bal "$SIM_ADDR")"; [ -n "$SB" ] || die "SIM_SOURCE_ADDRESS $SIM_ADDR is not funded on $NETWORK"
  warn "source $SOURCE_ADDR unfunded; simulating as $SIM_ADDR (balance ${SB} XLM). Execute would REFUSE."
else
  echo "  source  : $SOURCE_ADDR balance ${BAL} XLM"
fi
[ "$EXECUTE" = 0 ] || [ "$SIM_ADDR" = "$SOURCE_ADDR" ] || die "internal: simulation source differs from signer"

NET=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")
NETQ="--rpc-url $RPC_URL --network-passphrase '$PASSPHRASE'"

# read-only call (simulation only: --send=no never signs or submits)
ro() { # contract fn [args...] -> JSON result on stdout
  local id="$1" fn="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "$SIM_ADDR" "${NET[@]}" --send=no -- "$fn" "$@" 2>/dev/null | tail -1
}
unq() { tr -d '"'; }

# ---------------------------------------------------------------- wasm
step "verifier wasm"
VER_WASM="$OUT_DIR/chestzk_verifier.wasm"
if [ -n "$RELEASE_TAG" ]; then
  need gh
  [ -z "${WASM_DIR:-}" ] || die "set RELEASE_TAG or WASM_DIR, not both"
  REL_DIR="$(mktemp -d)"
  echo "  \$ gh release download $RELEASE_TAG --repo $RELEASE_REPO --pattern '*.wasm'"
  gh release download "$RELEASE_TAG" --repo "$RELEASE_REPO" --pattern '*.wasm' --dir "$REL_DIR" >/dev/null \
    || die "could not download wasm assets of release $RELEASE_TAG from $RELEASE_REPO"
  N_WASM="$(fd -t f -i 'chestzk[-_]verifier.*\.wasm$' "$REL_DIR" | wc -l | tr -d ' ')"
  [ "$N_WASM" = 1 ] || die "release $RELEASE_TAG must have exactly one chestzk-verifier wasm (found $N_WASM: $(ls "$REL_DIR" | tr '\n' ' '))"
  REL_WASM="$(fd -t f -i 'chestzk[-_]verifier.*\.wasm$' "$REL_DIR")"
  # The wasm is built by the pinned reusable workflow (stellar-expert/soroban-build-workflow@6b16426), so the
  # attestation is signed by that workflow while the source repo is $RELEASE_REPO. Require both.
  echo "  \$ gh attestation verify $(basename "$REL_WASM") --repo $RELEASE_REPO --signer-repo stellar-expert/soroban-build-workflow"
  ATT_JSON="$(gh attestation verify "$REL_WASM" --repo "$RELEASE_REPO" --signer-repo stellar-expert/soroban-build-workflow --format json 2>/dev/null)" \
    || die "build attestation check failed for $(basename "$REL_WASM") (not built from $RELEASE_REPO by stellar-expert/soroban-build-workflow?)"
  ATT_SIGNER="$(printf '%s' "$ATT_JSON" | jq -r '.[0].verificationResult.signature.certificate.buildSignerURI // empty')"
  case "$ATT_SIGNER" in
    *"/stellar-expert/soroban-build-workflow/.github/workflows/release.yml@6b16426dd3a61715ddddf83a2df322a6371fe071") ;;
    *) die "attestation signer $ATT_SIGNER is not the pinned stellar-expert/soroban-build-workflow release.yml@6b16426" ;;
  esac
  ATT_REF="$(printf '%s' "$ATT_JSON" | jq -r '.[0].verificationResult.signature.certificate.sourceRepositoryRef // empty')"
  echo "  attestation source ref: $ATT_REF"
  if [ "$NETWORK" = mainnet ]; then
    case "$ATT_REF" in
      refs/heads/main|refs/tags/contracts-v*) ;;
      *) die "mainnet needs a wasm built from main or a contracts-v* tag (attestation ref: $ATT_REF)" ;;
    esac
  fi
  echo "  attestation OK: built by $RELEASE_REPO GitHub Actions"
  mkdir -p "$OUT_DIR"
  cp "$REL_WASM" "$VER_WASM"
elif [ -z "${WASM_DIR:-}" ]; then
  warn "LOCAL build: hashes will not match the release; mainnet --execute requires RELEASE_TAG"
  mkdir -p "$OUT_DIR"
  echo "  \$ stellar contract build --manifest-path contracts/verifier-mainnet/Cargo.toml --out-dir $OUT_DIR"
  stellar contract build --manifest-path contracts/verifier-mainnet/Cargo.toml --out-dir "$OUT_DIR"
fi
[ -f "$VER_WASM" ] || die "missing $VER_WASM"
VER_HASH="$(shasum -a 256 "$VER_WASM" | awk '{print $1}')"
echo "  verifier wasm sha256: $VER_HASH ($(wc -c <"$VER_WASM" | tr -d ' ') bytes)"
if [ "$EXECUTE" = 1 ]; then
  [ ! -f "$OUT_JSON" ] || die "$OUT_JSON already exists; move it away to redeploy (never overwritten)"
fi

# ---------------------------------------------------------------- simulate
step "simulation vs $NETWORK (unsigned; simulateTransaction only)"
sim_upload() { # wasm -> stroops or "ERR:..."
  local xdr res
  xdr="$(stellar contract upload --wasm "$1" --source-account "$SIM_ADDR" "${NET[@]}" --build-only 2>/dev/null | tail -1)" || { echo "ERR:build-only failed"; return; }
  res="$(printf '%s' "$xdr" | node "$HERE/simulate-tx.mjs" "$RPC_URL" 2>&1 || true)"
  if [ "$(printf '%s' "$res" | jq -r .ok 2>/dev/null)" = true ]; then printf '%s' "$res" | jq -r .minResourceFeeStroops
  else echo "ERR:$(printf '%s' "$res" | jq -r .error 2>/dev/null | head -1)"; fi
}
INCL=100 # base inclusion fee in stroops (one op)
RU="$(sim_upload "$VER_WASM")"
[[ "$RU" =~ ^[0-9]+$ ]] || die "verifier upload simulation failed: $RU (nothing was sent)"
VER_UP="$(xlm $((RU + INCL)))"
echo "  (deploy of the instance cannot be simulated before the wasm is on-chain: estimate used)"

# ---------------------------------------------------------------- plan table
step "plan and budget (XLM)"
ITEMS=(
  "1|upload verifier wasm|simulated|$VER_UP|$BUD_UP"
  "2|deploy verifier instance (no constructor)|estimate|$EST_DEPLOY|0.5"
)
TOTAL=0
printf '  %-3s %-52s %-9s %10s %8s\n' "#" "item" "basis" "XLM" "budget"
for it in "${ITEMS[@]}"; do
  IFS='|' read -r n name basis amt bud <<<"$it"
  printf '  %-3s %-52s %-9s %10.4f %8s\n' "$n" "$name" "$basis" "$amt" "$bud"
  TOTAL="$(add "$TOTAL" "$amt")"
done
printf '  %-3s %-52s %-9s %10.4f %8s\n' "" "TOTAL (fees)" "" "$TOTAL" "$HARD_CAP_XLM"
OVER=0
awk -v t="$TOTAL" -v c="$HARD_CAP_XLM" 'BEGIN{exit !(t+0>c+0)}' && OVER=1 || true
awk -v v="$VER_UP" -v b="$BUD_UP" 'BEGIN{exit !(v+0>b+0)}' && warn "verifier upload ${VER_UP} > budget ${BUD_UP}" || true
if [ "$OVER" = 1 ]; then echo "  RESULT: total ${TOTAL} XLM EXCEEDS hard cap ${HARD_CAP_XLM} XLM" >&2; fi

NEED_BAL="$(add "$TOTAL" 2)"
if [ -n "$BAL" ]; then
  awk -v b="$BAL" -v m="$NEED_BAL" 'BEGIN{exit !(b+0>=m+0)}' || { [ "$EXECUTE" = 1 ] && die "balance ${BAL} XLM < required ${NEED_BAL} XLM (total + 2 reserve)" || warn "balance ${BAL} XLM < required ${NEED_BAL} XLM"; }
fi

echo
echo "  commands:"
echo "  \$ stellar contract upload --wasm $VER_WASM --source-account $SOURCE $NETQ"
echo "  \$ stellar contract deploy --wasm-hash $VER_HASH --source-account $SOURCE $NETQ"
echo "  \$ (read-only) vk_fingerprint() == $MANIFEST_FP; fetched wasm sha256 == $VER_HASH"
echo "  \$ write $OUT_JSON (never overwritten)"
echo
echo "  NOTE: the verifier is stateless (no constructor, no admin, no storage); the instance is fully defined by its wasm."

if [ "$EXECUTE" = 0 ]; then
  echo
  if [ "$OVER" = 1 ]; then echo "DRY-RUN FAILED: estimate exceeds hard cap." >&2; exit 3; fi
  echo "DRY-RUN complete. Re-run with --execute to send."
  exit 0
fi
[ "$OVER" = 0 ] || die "estimated total ${TOTAL} XLM exceeds hard cap ${HARD_CAP_XLM} XLM"

# ---------------------------------------------------------------- execute
LOG="$(mktemp -d)"
txhash() { rg -o 'Signing transaction: ([0-9a-f]{64})' -r '$1' "$1" 2>/dev/null | tail -1 || true; }

step "1/3 upload verifier"
GOT="$(stellar contract upload --wasm "$VER_WASM" --source-account "$SOURCE" "${NET[@]}" 2> >(tee "$LOG/1.err" >&2) | tail -1)"
[ "$GOT" = "$VER_HASH" ] || die "uploaded verifier hash $GOT != local $VER_HASH (STOP: do not continue)"
step "2/3 deploy verifier"
VERIFIER="$(stellar contract deploy --wasm-hash "$VER_HASH" --source-account "$SOURCE" "${NET[@]}" \
  2> >(tee "$LOG/2.err" >&2) | tail -1)"
[[ "$VERIFIER" =~ ^C[A-Z2-7]{55}$ ]] || die "unexpected deploy output: $VERIFIER"
echo "  verifier: $VERIFIER"

step "3/3 verify on-chain state (STOP otherwise)"
ONCHAIN_FP="$(ro "$VERIFIER" vk_fingerprint | unq)"
[[ "$ONCHAIN_FP" =~ ^[0-9a-f]{64}$ ]] || die "could not read vk_fingerprint() from $VERIFIER (got '$ONCHAIN_FP'). Abandon $VERIFIER."
[ "$ONCHAIN_FP" = "$MANIFEST_FP" ] || die "on-chain vk_fingerprint $ONCHAIN_FP != manifest $MANIFEST_FP. Abandon $VERIFIER."
FETCH_DIR="$(mktemp -d)"
stellar contract fetch --id "$VERIFIER" --out-file "$FETCH_DIR/verifier.wasm" "${NET[@]}" >/dev/null 2>&1 || die "could not fetch deployed wasm of $VERIFIER"
ONCHAIN_WASM="$(shasum -a 256 "$FETCH_DIR/verifier.wasm" | awk '{print $1}')"
[ "$ONCHAIN_WASM" = "$VER_HASH" ] || die "on-chain wasm sha256 $ONCHAIN_WASM != uploaded $VER_HASH. Abandon $VERIFIER."
echo "  vk_fingerprint() == manifest ($ONCHAIN_FP) and on-chain wasm sha256 == uploaded ($ONCHAIN_WASM) OK"

mkdir -p deployments
[ ! -f "$OUT_JSON" ] || die "$OUT_JSON appeared meanwhile; refusing to overwrite"
jq -n --arg net "$NETWORK" --arg pass "$PASSPHRASE" --arg rpc "$RPC_URL" --arg ver "$VERIFIER" \
  --arg vh "$ONCHAIN_WASM" --arg fp "$ONCHAIN_FP" --arg rt "$RELEASE_TAG" --arg cd "$CEREMONY_DIR" \
  --arg vks "$VK_FILE_SHA" --arg man "$MANIFEST" --arg dep "$SOURCE_ADDR" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg t1 "$(txhash "$LOG/1.err")" --arg t2 "$(txhash "$LOG/2.err")" '{
    network:$net, passphrase:$pass, rpcUrl:$rpc,
    verifier:$ver, verifierWasmHash:$vh, vkFingerprint:$fp,
    releaseTag:$rt, ceremonyDir:$cd, verificationKeySha256:$vks, manifest:$man,
    deployer:$dep, deployedAt:$at, txs:{verifierUpload:$t1, verifierDeploy:$t2}
  }' > "$OUT_JSON"
echo "  wrote $OUT_JSON"; jq . "$OUT_JSON"
echo "next: VERIFIER_RECORD=$OUT_JSON NETWORK=$NETWORK scripts/mainnet/deploy-registry.sh   (dry-run first)"
