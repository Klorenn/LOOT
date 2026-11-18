#!/usr/bin/env bash
# Loot · deploy of the REGISTRY v2 contract (contracts/chest) against an ALREADY DEPLOYED verifier.
#
# v2 uses a constructor: deploy and initialisation are ONE atomic transaction, so there is no init front-run
# window. The verifier is NOT redeployed here (scripts/mainnet/deploy-verifier.sh does that and writes a record):
# this script checks that the verifier named by the record is the one on-chain, byte for byte, before pointing at it.
#
# DRY-RUN BY DEFAULT. Nothing is signed or sent unless you pass --execute.
#   scripts/mainnet/deploy-registry.sh                 # dry-run: preflight + verifier checks + simulate upload + budget table
#   scripts/mainnet/deploy-registry.sh --execute       # really send (spends XLM)
#
# Env:
#   SOURCE                  stellar identity name that pays and signs (G... pubkey allowed in dry-run only)
#   SIM_SOURCE_ADDRESS      any funded mainnet G... address, used ONLY to simulate when SOURCE is unfunded/a bare key
#   NETWORK                 mainnet (default) | testnet
#   VERIFIER_RECORD         deployments/verifier-<network>.json written by deploy-verifier.sh (default
#                           deployments/verifier-mainnet.json). The expected verifier id, wasm sha256 and vk_fingerprint
#                           come from it; the on-chain verifier must match all three or the run is refused.
#   LEGACY_OCT_VERIFIER=1   mainnet only: ignore the record and use the 2026-10 single-contributor verifier pinned below
#                           (CALYISOE..., wasm 8df17eda..., manifest circuits/ceremony/release-2026-10-26).
#   MAINNET_VERIFIER_ID     optional sanity check: must equal the verifier id of the record (or of the legacy pin).
#   RELEASE_TAG             GitHub release from .github/workflows/release-wasm.yml holding the registry wasm.
#                           REQUIRED with --execute: the wasm is downloaded from that release and its build
#                           attestation is checked (gh attestation verify), so mainnet only gets a CI-built,
#                           verifiable wasm. RELEASE_REPO defaults to Klorenn/LOOT.
#                           (testnet: RELEASE_TAG is optional.)
#   WASM_DIR                dry-run and testnet only: dir with chestzk_chest.wasm; else, without RELEASE_TAG, built locally from
#                           contracts/chest (needs rustup rustc >= 1.91). Local builds are refused with --execute on mainnet.
#   RELAYER_FLOAT_XLM       default 5         HARD_CAP_XLM     default 80
#   RPC_URL / HORIZON_URL   defaults per NETWORK (mainnet.sorobanrpc.com + horizon.stellar.org / testnet equivalents)
# Record: deployments/registry-v2-mainnet.json (never overwritten). Testnet: deployments/registry-v2-testnet-<UTC time>.json.
set -euo pipefail

EXECUTE=0
for a in "$@"; do
  case "$a" in
    --execute) EXECUTE=1 ;;
    -h|--help) sed -n 2,34p "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done

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
  *) echo "REFUSING: NETWORK must be mainnet or testnet (got '$NETWORK')" >&2; exit 1 ;;
esac
export NETWORK_PASSPHRASE="$PASSPHRASE"   # read by simulate-tx.mjs
HARD_CAP_XLM="${HARD_CAP_XLM:-80}"
RELAYER_FLOAT_XLM="${RELAYER_FLOAT_XLM:-5}"
NATIVE_SAC="CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
# LEGACY: the 2026-10 single-contributor verifier already on mainnet (only used with LEGACY_OCT_VERIFIER=1).
LEGACY_VERIFIER_ID="CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY"
LEGACY_VERIFIER_WASM_SHA256="8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5"
LEGACY_MANIFEST="contracts/verifier-mainnet/verifier-manifest.json"   # copy of circuits/ceremony/release-2026-10-26/verifier manifest
LEGACY_CEREMONY_DIR="circuits/ceremony/release-2026-10-26"
if [ "$NETWORK" = mainnet ]; then
  OUT_JSON="deployments/registry-v2-mainnet.json"                 # v1 record (registry-mainnet.json) is never touched
else
  OUT_JSON="deployments/registry-v2-testnet-$(date -u +%Y%m%dT%H%M%SZ).json"   # existing testnet records are never touched
fi
OUT_DIR="${WASM_DIR:-$ROOT/.build-registry-v2-$NETWORK}"

EST_DEPLOY=0.5   # deploy instance with constructor: cannot be simulated before the wasm is uploaded
BUD_REG_UP=14.0

die()  { echo "REFUSING: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
step() { echo; echo "== $* =="; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1"; }
xlm()  { awk -v s="$1" 'BEGIN{printf "%.4f", s/10000000}'; }
add()  { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", a+b}'; }

need stellar; need jq; need curl; need shasum; need node; need rg

RELEASE_REPO="${RELEASE_REPO:-Klorenn/LOOT}"
RELEASE_TAG="${RELEASE_TAG:-}"
[ "$EXECUTE" = 0 ] || [ "$NETWORK" != mainnet ] || [ -n "$RELEASE_TAG" ] || die "--execute on mainnet needs RELEASE_TAG (deploy only the CI-built release wasm, never a local build)"

[ "$EXECUTE" = 1 ] && echo "MODE: EXECUTE (real $NETWORK transactions)" || echo "MODE: DRY-RUN (nothing is signed or sent; pass --execute to send)"

# ---------------------------------------------------------------- expected verifier (local files only)
step "expected verifier"
if [ "${LEGACY_OCT_VERIFIER:-0}" = 1 ]; then
  [ "$NETWORK" = mainnet ] || die "LEGACY_OCT_VERIFIER is mainnet only"
  [ -z "${VERIFIER_RECORD:-}" ] || die "set VERIFIER_RECORD or LEGACY_OCT_VERIFIER=1, not both"
  warn "LEGACY: using the pinned 2026-10 single-contributor verifier, NOT a multiparty-ceremony verifier"
  VERIFIER_ID="$LEGACY_VERIFIER_ID"; EXPECT_WASM="$LEGACY_VERIFIER_WASM_SHA256"
  CEREMONY_DIR="$LEGACY_CEREMONY_DIR"
  MANIFEST_FP="$(jq -r '.vk_sha256 // empty' "$LEGACY_MANIFEST")"
  VERIFIER_SRC="legacy pin ($LEGACY_MANIFEST)"
else
  VERIFIER_RECORD="${VERIFIER_RECORD:-deployments/verifier-$NETWORK.json}"
  [ -f "$VERIFIER_RECORD" ] || die "missing verifier record $VERIFIER_RECORD (run scripts/mainnet/deploy-verifier.sh --execute first, or set VERIFIER_RECORD)"
  REC_NET="$(jq -r '.network // empty' "$VERIFIER_RECORD")"
  REC_PASS="$(jq -r '.passphrase // empty' "$VERIFIER_RECORD")"
  [ "$REC_NET" = "$NETWORK" ] && [ "$REC_PASS" = "$PASSPHRASE" ] || die "$VERIFIER_RECORD is for network '$REC_NET', not $NETWORK"
  VERIFIER_ID="$(jq -r '.verifier // empty' "$VERIFIER_RECORD")"
  EXPECT_WASM="$(jq -r '.verifierWasmHash // empty' "$VERIFIER_RECORD")"
  MANIFEST_FP="$(jq -r '.vkFingerprint // empty' "$VERIFIER_RECORD")"
  CEREMONY_DIR="$(jq -r '.ceremonyDir // empty' "$VERIFIER_RECORD")"
  VERIFIER_SRC="record $VERIFIER_RECORD (release '$(jq -r '.releaseTag // ""' "$VERIFIER_RECORD")', ceremony $CEREMONY_DIR)"
fi
[[ "$VERIFIER_ID" =~ ^C[A-Z2-7]{55}$ ]] || die "no valid verifier contract id in $VERIFIER_SRC"
[[ "$EXPECT_WASM" =~ ^[0-9a-f]{64}$ ]] || die "no valid verifier wasm sha256 in $VERIFIER_SRC"
[[ "$MANIFEST_FP" =~ ^[0-9a-f]{64}$ ]] || die "no valid vk fingerprint in $VERIFIER_SRC"
[ -z "${MAINNET_VERIFIER_ID:-}" ] || [ "$MAINNET_VERIFIER_ID" = "$VERIFIER_ID" ] || die "MAINNET_VERIFIER_ID $MAINNET_VERIFIER_ID != verifier $VERIFIER_ID of $VERIFIER_SRC"
echo "  verifier id : $VERIFIER_ID"
echo "  source      : $VERIFIER_SRC"

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

TOKEN="$(stellar contract id asset --asset native "${NET[@]}")"
[ "$NETWORK" != mainnet ] || [ "$TOKEN" = "$NATIVE_SAC" ] || die "derived native SAC $TOKEN != expected $NATIVE_SAC"
echo "  token   : $TOKEN (native XLM SAC; FIXED in the constructor, the registry rejects any other token)"
echo "  verifier: $VERIFIER_ID (constructor argument)"

# read-only call (simulation only: --send=no never signs or submits)
ro() { # contract fn [args...] -> JSON result on stdout
  local id="$1" fn="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "$SIM_ADDR" "${NET[@]}" --send=no -- "$fn" "$@" 2>/dev/null | tail -1
}
unq() { tr -d '"'; }

# ---------------------------------------------------------------- verifier gate
step "verifier gate (the on-chain verifier must be exactly the one in the record)"
# the ceremony folder pins verification_key.json; it must still be in the tree
[ -f "$CEREMONY_DIR/verification_key.json" ] || die "missing $CEREMONY_DIR/verification_key.json"
ONCHAIN_FP="$(ro "$VERIFIER_ID" vk_fingerprint | unq)"
[[ "$ONCHAIN_FP" =~ ^[0-9a-f]{64}$ ]] || die "could not read vk_fingerprint() from $VERIFIER_ID (got '$ONCHAIN_FP')"
[ "$ONCHAIN_FP" = "$MANIFEST_FP" ] || die "on-chain vk_fingerprint $ONCHAIN_FP != expected $MANIFEST_FP"
echo "  vk_fingerprint on-chain == expected ($MANIFEST_FP) OK"
FETCH_DIR="$(mktemp -d)"
stellar contract fetch --id "$VERIFIER_ID" --out-file "$FETCH_DIR/verifier.wasm" "${NET[@]}" >/dev/null 2>&1 || die "could not fetch verifier wasm"
ONCHAIN_WASM="$(shasum -a 256 "$FETCH_DIR/verifier.wasm" | awk '{print $1}')"
[ "$ONCHAIN_WASM" = "$EXPECT_WASM" ] || die "on-chain verifier wasm sha256 $ONCHAIN_WASM != expected $EXPECT_WASM"
echo "  verifier wasm sha256 == expected ($ONCHAIN_WASM) OK"

# ---------------------------------------------------------------- wasm
step "registry wasm"
REG_WASM="$OUT_DIR/chestzk_chest.wasm"
if [ -n "$RELEASE_TAG" ]; then
  need gh
  [ -z "${WASM_DIR:-}" ] || die "set RELEASE_TAG or WASM_DIR, not both"
  REL_DIR="$(mktemp -d)"
  echo "  \$ gh release download $RELEASE_TAG --repo $RELEASE_REPO --pattern '*.wasm'"
  gh release download "$RELEASE_TAG" --repo "$RELEASE_REPO" --pattern '*.wasm' --dir "$REL_DIR" >/dev/null \
    || die "could not download wasm assets of release $RELEASE_TAG from $RELEASE_REPO"
  N_WASM="$(fd -t f -i 'chestzk[-_]chest.*\.wasm$' "$REL_DIR" | wc -l | tr -d ' ')"
  [ "$N_WASM" = 1 ] || die "release $RELEASE_TAG must have exactly one chestzk-chest wasm (found $N_WASM: $(ls "$REL_DIR" | tr '\n' ' '))"
  REL_WASM="$(fd -t f -i 'chestzk[-_]chest.*\.wasm$' "$REL_DIR")"
  echo "  \$ gh attestation verify $(basename "$REL_WASM") --repo $RELEASE_REPO"
  gh attestation verify "$REL_WASM" --repo "$RELEASE_REPO" >/dev/null 2>&1 \
    || die "build attestation check failed for $(basename "$REL_WASM") (not built by $RELEASE_REPO CI?)"
  echo "  attestation OK: built by $RELEASE_REPO GitHub Actions"
  mkdir -p "$OUT_DIR"
  cp "$REL_WASM" "$REG_WASM"
elif [ -z "${WASM_DIR:-}" ]; then
  warn "dry-run with a LOCAL build: hashes will not match the release; --execute requires RELEASE_TAG"
  RUSTV="$(rustc -V | awk '{print $2}')"
  [ "$(printf '%s\n1.91.0\n' "$RUSTV" | sort -V | head -1)" = "1.91.0" ] || die "rustc $RUSTV < 1.91.0 (soroban-sdk 27.0.6); use rustup's toolchain or set WASM_DIR"
  mkdir -p "$OUT_DIR"
  echo "  \$ stellar contract build --manifest-path contracts/chest/Cargo.toml --out-dir $OUT_DIR"
  stellar contract build --manifest-path contracts/chest/Cargo.toml --out-dir "$OUT_DIR"
fi
[ -f "$REG_WASM" ] || die "missing $REG_WASM"
REG_HASH="$(shasum -a 256 "$REG_WASM" | awk '{print $1}')"
echo "  registry wasm sha256: $REG_HASH ($(wc -c <"$REG_WASM" | tr -d ' ') bytes)"
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
RU="$(sim_upload "$REG_WASM")"
[[ "$RU" =~ ^[0-9]+$ ]] || die "registry upload simulation failed: $RU (nothing was sent)"
REG_UP="$(xlm $((RU + INCL)))"
echo "  (deploy with constructor cannot be simulated before the wasm is on-chain: estimate used)"

# ---------------------------------------------------------------- plan table
step "plan and budget (XLM)"
ITEMS=(
  "1|upload registry wasm|simulated|$REG_UP|$BUD_REG_UP"
  "2|deploy registry instance + constructor(verifier, token)|estimate|$EST_DEPLOY|0.5"
)
TOTAL=0; SPEND=0
printf '  %-3s %-52s %-9s %10s %8s\n' "#" "item" "basis" "XLM" "budget"
for it in "${ITEMS[@]}"; do
  IFS='|' read -r n name basis amt bud <<<"$it"
  printf '  %-3s %-52s %-9s %10.4f %8s\n' "$n" "$name" "$basis" "$amt" "$bud"
  TOTAL="$(add "$TOTAL" "$amt")"
  SPEND="$(add "$SPEND" "$amt")"
done
printf '  %-3s %-52s %-9s %10.4f %8s\n' "" "TOTAL (fees)" "" "$TOTAL" "$HARD_CAP_XLM"
OVER=0
awk -v t="$TOTAL" -v c="$HARD_CAP_XLM" 'BEGIN{exit !(t+0>c+0)}' && OVER=1 || true
awk -v v="$REG_UP" -v b="$BUD_REG_UP" 'BEGIN{exit !(v+0>b+0)}' && warn "registry upload ${REG_UP} > budget ${BUD_REG_UP}" || true
if [ "$OVER" = 1 ]; then echo "  RESULT: total ${TOTAL} XLM EXCEEDS hard cap ${HARD_CAP_XLM} XLM" >&2; fi

NEED_BAL="$(add "$TOTAL" 2)"
if [ -n "$BAL" ]; then
  awk -v b="$BAL" -v m="$NEED_BAL" 'BEGIN{exit !(b+0>=m+0)}' || { [ "$EXECUTE" = 1 ] && die "balance ${BAL} XLM < required ${NEED_BAL} XLM (total + 2 reserve)" || warn "balance ${BAL} XLM < required ${NEED_BAL} XLM"; }
fi

echo
echo "  commands:"
echo "  \$ stellar contract upload --wasm $REG_WASM --source-account $SOURCE $NETQ"
echo "  \$ stellar contract deploy --wasm-hash $REG_HASH --source-account $SOURCE $NETQ -- --verifier $VERIFIER_ID --token $TOKEN"
echo "  \$ (read-only) registry verifier() == $VERIFIER_ID, token() == $TOKEN, version() == 2"
[ "$NETWORK" != mainnet ] || echo "  \$ node scripts/mainnet/verify-registry.mjs <json>"
echo
echo "  NOTE: contracts/chest v2 has __constructor(verifier, token): deploy and init are ONE tx (no front-run window)."
echo "        The contract is NOT upgradeable (no upgrade, no admin). Still verified after deploy, below."

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

step "1/3 upload registry"
GOT="$(stellar contract upload --wasm "$REG_WASM" --source-account "$SOURCE" "${NET[@]}" 2> >(tee "$LOG/1.err" >&2) | tail -1)"
[ "$GOT" = "$REG_HASH" ] || die "uploaded registry hash $GOT != local $REG_HASH (STOP: do not continue)"
step "2/3 deploy registry (constructor sets verifier + token atomically)"
REGISTRY="$(stellar contract deploy --wasm-hash "$REG_HASH" --source-account "$SOURCE" "${NET[@]}" \
  2> >(tee "$LOG/2.err" >&2) -- --verifier "$VERIFIER_ID" --token "$TOKEN" | tail -1)"
[[ "$REGISTRY" =~ ^C[A-Z2-7]{55}$ ]] || die "unexpected deploy output: $REGISTRY"
echo "  registry: $REGISTRY"

step "3/3 verify on-chain state (verifier/token/version must match; STOP otherwise)"
GOT_V="$(ro "$REGISTRY" verifier | unq)"; GOT_T="$(ro "$REGISTRY" token | unq)"; GOT_VER="$(ro "$REGISTRY" version | unq)"
[ "$GOT_V" = "$VERIFIER_ID" ] || die "registry verifier() $GOT_V != $VERIFIER_ID. Abandon $REGISTRY."
[ "$GOT_T" = "$TOKEN" ] || die "registry token() $GOT_T != $TOKEN. Abandon $REGISTRY."
[ "$GOT_VER" = "2" ] || die "registry version() $GOT_VER != 2. Abandon $REGISTRY."
ONCHAIN_FP2="$(ro "$GOT_V" vk_fingerprint | unq)"
[ "$ONCHAIN_FP2" = "$MANIFEST_FP" ] || die "post-deploy verifier vk_fingerprint $ONCHAIN_FP2 != expected. Abandon $REGISTRY."
echo "  verifier() / token() / version() / vk_fingerprint OK"

mkdir -p deployments
[ ! -f "$OUT_JSON" ] || die "$OUT_JSON appeared meanwhile; refusing to overwrite"
jq -n --arg pass "$PASSPHRASE" --arg rpc "$RPC_URL" --arg reg "$REGISTRY" --arg ver "$VERIFIER_ID" --arg tok "$TOKEN" \
  --arg rh "$REG_HASH" --arg vh "$EXPECT_WASM" --arg fp "$MANIFEST_FP" --arg net "$NETWORK" --arg vrec "${VERIFIER_RECORD:-legacy-oct-2026}" \
  --arg rt "$RELEASE_TAG" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg t1 "$(txhash "$LOG/1.err")" --arg t2 "$(txhash "$LOG/2.err")" '{
    network:$net, version:2, passphrase:$pass, rpcUrl:$rpc, verifierRecord:$vrec,
    registry:$reg, verifier:$ver, token:$tok,
    registryWasmHash:$rh, releaseTag:$rt, verifierWasmHash:$vh, vkFingerprint:$fp,
    deployedAt:$at, txs:{registryUpload:$t1, registryDeploy:$t2}
  }' > "$OUT_JSON"
echo "  wrote $OUT_JSON"; jq . "$OUT_JSON"
if [ "$NETWORK" = mainnet ]; then
  node "$HERE/verify-registry.mjs" "$OUT_JSON" || warn "final verification reported mismatches"
fi
echo "next: create the sample chest from the app (deadline must be in the future and <= 30 days, and prize x places <= 50 XLM per chest)."
