#!/usr/bin/env bash
# Loot · mainnet deploy of the REGISTRY v2 contract (contracts/chest) against the EXISTING ceremony verifier.
#
# v2 uses a constructor: deploy and initialisation are ONE atomic transaction, so there is no init front-run
# window. The verifier is NOT redeployed: this script checks the one that is already on mainnet.
#
# DRY-RUN BY DEFAULT. Nothing is signed or sent unless you pass --execute.
#   scripts/mainnet/deploy-registry.sh                 # dry-run: preflight + verifier checks + simulate upload + budget table
#   scripts/mainnet/deploy-registry.sh --execute       # really send (spends XLM)
#
# Env:
#   SOURCE                  stellar identity name that pays and signs (G... pubkey allowed in dry-run only)
#   SIM_SOURCE_ADDRESS      any funded mainnet G... address, used ONLY to simulate when SOURCE is unfunded/a bare key
#   MAINNET_VERIFIER_ID     verifier contract the registry will point at (default: the ceremony verifier below).
#                           Anything else is REFUSED unless it is this id.
#   WASM_DIR                dir with chestzk_chest.wasm; else built from contracts/chest (needs rustup rustc >= 1.91)
#   RELAYER_FLOAT_XLM       default 5         HARD_CAP_XLM     default 80
#   RPC_URL / HORIZON_URL   defaults https://mainnet.sorobanrpc.com / https://horizon.stellar.org
set -euo pipefail

EXECUTE=0
for a in "$@"; do
  case "$a" in
    --execute) EXECUTE=1 ;;
    -h|--help) sed -n 2,18p "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"   # Homebrew rustc 1.90 shadows rustup 1.99

MAINNET_PASSPHRASE="Public Global Stellar Network ; September 2015"
PASSPHRASE="$MAINNET_PASSPHRASE"
RPC_URL="${RPC_URL:-https://mainnet.sorobanrpc.com}"
HORIZON_URL="${HORIZON_URL:-https://horizon.stellar.org}"
HARD_CAP_XLM="${HARD_CAP_XLM:-80}"
RELAYER_FLOAT_XLM="${RELAYER_FLOAT_XLM:-5}"
NATIVE_SAC="CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
# Ceremony verifier already on mainnet (wasm sha256 8df17eda...05b5; vk_fingerprint = manifest vk_sha256).
CEREMONY_VERIFIER_ID="CALYISOENO2N4575DWF2K2PHB5UAEHCWI5ZJCZXYNHC4OXYHJWVBGZKY"
CEREMONY_VERIFIER_WASM_SHA256="8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5"
MANIFEST="contracts/verifier-mainnet/verifier-manifest.json"   # copy of circuits/ceremony/release-2026-10-26/verifier manifest
CEREMONY_DIR="circuits/ceremony/release-2026-10-26"
OUT_JSON="deployments/registry-v2-mainnet.json"                 # v1 record (registry-mainnet.json) is never touched
OUT_DIR="${WASM_DIR:-$ROOT/.build-mainnet-registry-v2}"
VERIFIER_ID="${MAINNET_VERIFIER_ID:-$CEREMONY_VERIFIER_ID}"

EST_DEPLOY=0.5   # deploy instance with constructor: cannot be simulated before the wasm is uploaded
BUD_REG_UP=14.0

die()  { echo "REFUSING: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
step() { echo; echo "== $* =="; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1"; }
xlm()  { awk -v s="$1" 'BEGIN{printf "%.4f", s/10000000}'; }
add()  { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", a+b}'; }

need stellar; need jq; need curl; need shasum; need node; need rg

[ "$EXECUTE" = 1 ] && echo "MODE: EXECUTE (real mainnet transactions)" || echo "MODE: DRY-RUN (nothing is signed or sent; pass --execute to send)"

# ---------------------------------------------------------------- preflight
step "preflight"
[ -n "${SOURCE:-}" ] || die "SOURCE (stellar identity name) is required"
[ "$VERIFIER_ID" = "$CEREMONY_VERIFIER_ID" ] || die "MAINNET_VERIFIER_ID $VERIFIER_ID != the ceremony verifier $CEREMONY_VERIFIER_ID"
RPC_PASS="$(curl -fsS -X POST "$RPC_URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getNetwork"}' | jq -r '.result.passphrase')" || die "RPC $RPC_URL unreachable"
[ "$RPC_PASS" = "$MAINNET_PASSPHRASE" ] || die "RPC passphrase mismatch: '$RPC_PASS' (must be mainnet)"
echo "  network : mainnet ($RPC_URL) OK"

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
  [ "$EXECUTE" = 0 ] || die "source account $SOURCE_ADDR not funded on mainnet (or Horizon unreachable)"
  [ -n "${SIM_SOURCE_ADDRESS:-}" ] || die "source $SOURCE_ADDR not funded on mainnet; set SIM_SOURCE_ADDRESS=<funded G...> to simulate in dry-run"
  SIM_ADDR="$SIM_SOURCE_ADDRESS"
  SB="$(horizon_bal "$SIM_ADDR")"; [ -n "$SB" ] || die "SIM_SOURCE_ADDRESS $SIM_ADDR is not funded on mainnet"
  warn "source $SOURCE_ADDR unfunded; simulating as $SIM_ADDR (balance ${SB} XLM). Execute would REFUSE."
else
  echo "  source  : $SOURCE_ADDR balance ${BAL} XLM"
fi
[ "$EXECUTE" = 0 ] || [ "$SIM_ADDR" = "$SOURCE_ADDR" ] || die "internal: simulation source differs from signer"

NET=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")
NETQ="--rpc-url $RPC_URL --network-passphrase '$PASSPHRASE'"

TOKEN="$(stellar contract id asset --asset native "${NET[@]}")"
[ "$TOKEN" = "$NATIVE_SAC" ] || die "derived native SAC $TOKEN != expected $NATIVE_SAC"
echo "  token   : $TOKEN (native XLM SAC; FIXED in the constructor, the registry rejects any other token)"
echo "  verifier: $VERIFIER_ID (ceremony verifier; constructor argument)"

# read-only call (simulation only: --send=no never signs or submits)
ro() { # contract fn [args...] -> JSON result on stdout
  local id="$1" fn="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "$SIM_ADDR" "${NET[@]}" --send=no -- "$fn" "$@" 2>/dev/null | tail -1
}
unq() { tr -d '"'; }

# ---------------------------------------------------------------- verifier gate
step "verifier gate (the one already on mainnet must be the ceremony verifier)"
MANIFEST_FP="$(jq -r '.vk_sha256 // empty' "$MANIFEST")"
[[ "$MANIFEST_FP" =~ ^[0-9a-f]{64}$ ]] || die "no vk_sha256 in $MANIFEST"
# the ceremony release folder pins verification_key.json; make sure the manifest we trust is the release one
[ -f "$CEREMONY_DIR/verification_key.json" ] || die "missing $CEREMONY_DIR/verification_key.json"
ONCHAIN_FP="$(ro "$VERIFIER_ID" vk_fingerprint | unq)"
[[ "$ONCHAIN_FP" =~ ^[0-9a-f]{64}$ ]] || die "could not read vk_fingerprint() from $VERIFIER_ID (got '$ONCHAIN_FP')"
[ "$ONCHAIN_FP" = "$MANIFEST_FP" ] || die "on-chain vk_fingerprint $ONCHAIN_FP != ceremony manifest $MANIFEST_FP"
echo "  vk_fingerprint on-chain == ceremony manifest ($MANIFEST_FP) OK"
FETCH_DIR="$(mktemp -d)"
stellar contract fetch --id "$VERIFIER_ID" --out-file "$FETCH_DIR/verifier.wasm" "${NET[@]}" >/dev/null 2>&1 || die "could not fetch verifier wasm"
ONCHAIN_WASM="$(shasum -a 256 "$FETCH_DIR/verifier.wasm" | awk '{print $1}')"
[ "$ONCHAIN_WASM" = "$CEREMONY_VERIFIER_WASM_SHA256" ] || die "on-chain verifier wasm sha256 $ONCHAIN_WASM != ceremony $CEREMONY_VERIFIER_WASM_SHA256"
echo "  verifier wasm sha256 == ceremony release ($ONCHAIN_WASM) OK"

# ---------------------------------------------------------------- wasm
step "registry wasm"
REG_WASM="$OUT_DIR/chestzk_chest.wasm"
if [ -z "${WASM_DIR:-}" ]; then
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
step "simulation vs mainnet (unsigned; simulateTransaction only)"
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
echo "  \$ node scripts/mainnet/verify-registry.mjs <json>"
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
txhash() { rg -o 'ransaction hash is ([0-9a-f]{64})' -r '$1' "$1" 2>/dev/null | tail -1 || true; }

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
[ "$ONCHAIN_FP2" = "$MANIFEST_FP" ] || die "post-deploy verifier vk_fingerprint $ONCHAIN_FP2 != ceremony manifest. Abandon $REGISTRY."
echo "  verifier() / token() / version() / vk_fingerprint OK"

mkdir -p deployments
[ ! -f "$OUT_JSON" ] || die "$OUT_JSON appeared meanwhile; refusing to overwrite"
jq -n --arg pass "$PASSPHRASE" --arg rpc "$RPC_URL" --arg reg "$REGISTRY" --arg ver "$VERIFIER_ID" --arg tok "$TOKEN" \
  --arg rh "$REG_HASH" --arg vh "$CEREMONY_VERIFIER_WASM_SHA256" --arg fp "$MANIFEST_FP" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg t1 "$(txhash "$LOG/1.err")" --arg t2 "$(txhash "$LOG/2.err")" '{
    network:"mainnet", version:2, passphrase:$pass, rpcUrl:$rpc,
    registry:$reg, verifier:$ver, token:$tok,
    registryWasmHash:$rh, verifierWasmHash:$vh, vkFingerprint:$fp,
    deployedAt:$at, txs:{registryUpload:$t1, registryDeploy:$t2}
  }' > "$OUT_JSON"
echo "  wrote $OUT_JSON"; jq . "$OUT_JSON"
node "$HERE/verify-registry.mjs" "$OUT_JSON" || warn "final verification reported mismatches"
echo "next: create the sample chest from the app (deadline must be in the future and <= 90 days)."
