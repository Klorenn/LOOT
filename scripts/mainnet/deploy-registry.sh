#!/usr/bin/env bash
# Loot · mainnet deploy of the REGISTRY contract (contracts/chest) + post-ceremony Groth16 verifier
# (contracts/verifier) + ONE sample chest.
#
# DRY-RUN BY DEFAULT. Nothing is signed or sent unless you pass --execute.
#   scripts/mainnet/deploy-registry.sh                 # dry-run: preflight + simulate every tx vs mainnet + budget table
#   scripts/mainnet/deploy-registry.sh --execute       # really send (spends XLM)
#
# Env:
#   SOURCE                  stellar identity name that pays and signs (G... pubkey allowed in dry-run only)
#   SIM_SOURCE_ADDRESS      any funded mainnet G... address, used ONLY to simulate when SOURCE is unfunded/a bare key
#   VERIFIER_WASM_SHA256    (alias CEREMONY_EXPORT_HASH) sha256 of the verifier wasm built from the ceremony export.
#                           REQUIRED; must equal sha256 of the verifier wasm that will be uploaded. Otherwise REFUSE.
#                           (also read from a circuits/**/ceremony manifest field "verifierWasmSha256" if one exists)
#   WASM_DIR                dir with chestzk_verifier.wasm and chestzk_chest.wasm; else built from contracts/ (needs rustup rustc)
#   ADMIN                   G... for init(admin, ...). init does admin.require_auth(), so it must be SOURCE's address (default)
#   SAMPLE_FINGERPRINT      64-hex (32 bytes) answer commitment of the sample chest (required with --execute)
#   SAMPLE_PRIZE_XLM        default 30        SAMPLE_DEADLINE  unix secs, default 0 (= no deadline)
#   RELAYER_FLOAT_XLM       default 5         HARD_CAP_XLM     default 80
#   RPC_URL / HORIZON_URL   defaults https://mainnet.sorobanrpc.com / https://horizon.stellar.org
#   DRYRUN_ALLOW_TESTNET_VK=1   dry-run ONLY: skip the ceremony/testnet-VK refusals (output is flagged NOT EXECUTABLE)
set -euo pipefail

EXECUTE=0
for a in "$@"; do
  case "$a" in
    --execute) EXECUTE=1 ;;
    -h|--help) sed -n 2,23p "$0"; exit 0 ;;
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
SAMPLE_PRIZE_XLM="${SAMPLE_PRIZE_XLM:-30}"
SAMPLE_DEADLINE="${SAMPLE_DEADLINE:-0}"
RELAYER_FLOAT_XLM="${RELAYER_FLOAT_XLM:-5}"
NATIVE_SAC="CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
# VK fingerprint of the single-party (testnet) setup baked into the current contracts/verifier.
TESTNET_VK_FP="161f9d198dd1bcc1aaaa5cc95566cf528ff582e4c27accddd808346d520991c1"
OUT_JSON="deployments/registry-mainnet.json"
OUT_DIR="${WASM_DIR:-$ROOT/.build-mainnet-registry}"

# Estimates (XLM) for items that cannot be simulated before their prerequisites exist on-chain.
EST_DEPLOY=0.5; EST_INIT=0.05; EST_CREATE=0.1; EST_CLAIM=0.1
# Budget lines from the plan (for comparison only).
BUD_VER_UP=18.8; BUD_REG_UP=14.0

die()  { echo "REFUSING: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
step() { echo; echo "== $* =="; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1"; }
xlm()  { awk -v s="$1" 'BEGIN{printf "%.4f", s/10000000}'; }
add()  { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", a+b}'; }

need stellar; need jq; need curl; need shasum; need node; need rg; need fd; need xxd

[ "$EXECUTE" = 1 ] && echo "MODE: EXECUTE (real mainnet transactions)" || echo "MODE: DRY-RUN (nothing is signed or sent; pass --execute to send)"
OVERRIDE=0
if [ "${DRYRUN_ALLOW_TESTNET_VK:-0}" = 1 ]; then
  [ "$EXECUTE" = 0 ] || die "DRYRUN_ALLOW_TESTNET_VK is dry-run only; it can never be combined with --execute"
  OVERRIDE=1; warn "DRYRUN_ALLOW_TESTNET_VK=1: ceremony/VK refusals are skipped. This run is NOT EXECUTABLE."
fi

# ---------------------------------------------------------------- preflight
step "preflight"
[ -n "${SOURCE:-}" ] || die "SOURCE (stellar identity name) is required"
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

ADMIN="${ADMIN:-$SOURCE_ADDR}"
[[ "$ADMIN" =~ ^G[A-Z2-7]{55}$ ]] || die "ADMIN is not a G... address"
[ "$EXECUTE" = 0 ] || [ "$ADMIN" = "$SOURCE_ADDR" ] || die "init() calls admin.require_auth(); ADMIN must be SOURCE's address ($SOURCE_ADDR)"
echo "  admin   : $ADMIN"

TOKEN="$(stellar contract id asset --asset native --rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")"
[ "$TOKEN" = "$NATIVE_SAC" ] || die "derived native SAC $TOKEN != expected $NATIVE_SAC"
echo "  token   : $TOKEN (native XLM SAC; passed per chest, not stored by init)"

# ---------------------------------------------------------------- wasm
step "wasm artifacts"
VER_WASM="$OUT_DIR/chestzk_verifier.wasm"
REG_WASM="$OUT_DIR/chestzk_chest.wasm"
if [ -z "${WASM_DIR:-}" ]; then
  RUSTV="$(rustc -V | awk '{print $2}')"
  [ "$(printf '%s\n1.91.0\n' "$RUSTV" | sort -V | head -1)" = "1.91.0" ] || die "rustc $RUSTV < 1.91.0 (soroban-sdk 27.0.6); use rustup's toolchain or set WASM_DIR"
  mkdir -p "$OUT_DIR"
  # Verifier: the CEREMONY crate (contracts/verifier-mainnet = circuits/ceremony/release-2026-10-26/verifier),
  # built exactly like the release (plain cargo, NOT `stellar contract build`, which changes the wasm bytes):
  # sha256 must be 8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5.
  echo "  \$ cargo +stable build --release --target wasm32v1-none  (contracts/verifier-mainnet)"
  (cd contracts/verifier-mainnet && cargo +stable build --release --target wasm32v1-none)
  cp contracts/verifier-mainnet/target/wasm32v1-none/release/chestzk_verifier.wasm "$OUT_DIR/chestzk_verifier.wasm"
  echo "  \$ stellar contract build --manifest-path contracts/chest/Cargo.toml --out-dir $OUT_DIR"
  stellar contract build --manifest-path contracts/chest/Cargo.toml --out-dir "$OUT_DIR"
fi
[ -f "$VER_WASM" ] || die "missing $VER_WASM"
[ -f "$REG_WASM" ] || die "missing $REG_WASM"
VER_HASH="$(shasum -a 256 "$VER_WASM" | awk '{print $1}')"
REG_HASH="$(shasum -a 256 "$REG_WASM" | awk '{print $1}')"
echo "  verifier wasm sha256: $VER_HASH ($(wc -c <"$VER_WASM" | tr -d ' ') bytes)"
echo "  registry wasm sha256: $REG_HASH ($(wc -c <"$REG_WASM" | tr -d ' ') bytes)"

# ---------------------------------------------------------------- ceremony gate
step "verifier gate (must be post-ceremony)"
EXPECT_HASH="${VERIFIER_WASM_SHA256:-${CEREMONY_EXPORT_HASH:-8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5}}"  # default = ceremony release 2026-10-26
EXPECT_SRC="env"
if [ -z "$EXPECT_HASH" ] && [ -d circuits ]; then
  while IFS= read -r f; do
    h="$(jq -r '.verifierWasmSha256 // .verifier_wasm_sha256 // empty' "$f" 2>/dev/null || true)"
    if [[ "$h" =~ ^[0-9a-f]{64}$ ]]; then EXPECT_HASH="$h"; EXPECT_SRC="$f"; break; fi
  done < <(fd -HI -t f -d 5 -E node_modules -E build -g '*.json' circuits 2>/dev/null | rg -i 'ceremony|export|mainnet' || true)
fi
if [ "$OVERRIDE" = 1 ]; then
  warn "ceremony hash check skipped (override)"
else
  [ -n "$EXPECT_HASH" ] || die "no ceremony export hash. Set VERIFIER_WASM_SHA256 (or CEREMONY_EXPORT_HASH) to the sha256 of the verifier wasm built from the post-ceremony export, or provide a ceremony manifest under circuits/ with a 'verifierWasmSha256' field. The testnet verifier (single-party setup) must NEVER be used on mainnet."
  [[ "$EXPECT_HASH" =~ ^[0-9a-f]{64}$ ]] || die "ceremony hash is not 64 lowercase hex: $EXPECT_HASH"
  [ "$EXPECT_HASH" = "$VER_HASH" ] || die "verifier wasm sha256 $VER_HASH != ceremony hash $EXPECT_HASH (from $EXPECT_SRC). Rebuild contracts/verifier from the ceremony export."
  echo "  verifier wasm matches ceremony hash (from $EXPECT_SRC)"
fi
# Detect the testnet VK baked into the wasm (VK_FINGERPRINT constant is embedded as data).
if xxd -p "$VER_WASM" | tr -d '\n' | rg -q "$TESTNET_VK_FP"; then
  [ "$OVERRIDE" = 1 ] && warn "verifier wasm embeds the TESTNET VK fingerprint ${TESTNET_VK_FP:0:16}... (override active)" \
    || die "verifier wasm embeds the TESTNET VK fingerprint $TESTNET_VK_FP (single-party setup). Rebuild from the ceremony export."
else
  echo "  testnet VK fingerprint not present in verifier wasm OK"
fi
if [ "$EXECUTE" = 1 ]; then
  [[ "${SAMPLE_FINGERPRINT:-}" =~ ^[0-9a-fA-F]{64}$ ]] || die "--execute requires SAMPLE_FINGERPRINT (64 hex chars)"
  [ ! -f "$OUT_JSON" ] || die "$OUT_JSON already exists; move it away to redeploy (never overwritten)"
fi
SAMPLE_FP_ARG="${SAMPLE_FINGERPRINT:-$(printf '0%.0s' $(seq 64))}"

NET=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")
NETQ="--rpc-url $RPC_URL --network-passphrase '$PASSPHRASE'"
PRIZE_STROOPS="$(awk -v p="$SAMPLE_PRIZE_XLM" 'BEGIN{printf "%d", p*10000000}')"

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
VU="$(sim_upload "$VER_WASM")"; RU="$(sim_upload "$REG_WASM")"
FAILED=0
[[ "$VU" =~ ^[0-9]+$ ]] || { echo "  verifier upload simulation failed: $VU" >&2; FAILED=1; }
[[ "$RU" =~ ^[0-9]+$ ]] || { echo "  registry upload simulation failed: $RU" >&2; FAILED=1; }
[ "$FAILED" = 0 ] || die "could not simulate wasm uploads against mainnet (nothing was sent)"
VER_UP="$(xlm $((VU + INCL)))"; REG_UP="$(xlm $((RU + INCL)))"
# A WASM already on-chain makes the upload cheap; deploy-tx simulation needs the wasm uploaded first.
echo "  (deploy / init / create_chest / claim cannot be simulated before the wasm + instance exist: estimates used)"

# ---------------------------------------------------------------- plan table
step "plan and budget (XLM)"
ITEMS=(
  "1|upload verifier wasm|simulated|$VER_UP|$BUD_VER_UP"
  "2|deploy verifier instance|estimate|$EST_DEPLOY|0.5"
  "3|upload registry wasm|simulated|$REG_UP|$BUD_REG_UP"
  "4|deploy registry instance|estimate|$EST_DEPLOY|0.5"
  "5|init(admin, verifier)|estimate|$EST_INIT|-"
  "6|create_chest (sample)|estimate|$EST_CREATE|-"
  "7|claim sim (fee for one claim)|estimate|$EST_CLAIM|-"
  "8|sample chest prize (locked, refundable via close_chest)|funds|$SAMPLE_PRIZE_XLM|30"
  "9|relayer float|funds|$RELAYER_FLOAT_XLM|-"
)
TOTAL=0; SPEND=0
printf '  %-3s %-52s %-9s %10s %8s\n' "#" "item" "basis" "XLM" "budget"
for it in "${ITEMS[@]}"; do
  IFS='|' read -r n name basis amt bud <<<"$it"
  printf '  %-3s %-52s %-9s %10.4f %8s\n' "$n" "$name" "$basis" "$amt" "$bud"
  TOTAL="$(add "$TOTAL" "$amt")"
  [ "$basis" = funds ] || SPEND="$(add "$SPEND" "$amt")"
done
printf '  %-3s %-52s %-9s %10.4f %8s\n' "" "TOTAL (fees + funds)" "" "$TOTAL" "$HARD_CAP_XLM"
printf '  %-3s %-52s %-9s %10.4f\n' "" "of which burned as fees/rent" "" "$SPEND"
OVER=0
awk -v t="$TOTAL" -v c="$HARD_CAP_XLM" 'BEGIN{exit !(t+0>c+0)}' && OVER=1 || true
awk -v v="$VER_UP" -v b="$BUD_VER_UP" 'BEGIN{exit !(v+0>b+0)}' && warn "verifier upload ${VER_UP} > budget ${BUD_VER_UP}" || true
awk -v v="$REG_UP" -v b="$BUD_REG_UP" 'BEGIN{exit !(v+0>b+0)}' && warn "registry upload ${REG_UP} > budget ${BUD_REG_UP}" || true
if [ "$OVER" = 1 ]; then echo "  RESULT: total ${TOTAL} XLM EXCEEDS hard cap ${HARD_CAP_XLM} XLM" >&2; fi

NEED_BAL="$(add "$TOTAL" 2)"
if [ -n "$BAL" ]; then
  awk -v b="$BAL" -v m="$NEED_BAL" 'BEGIN{exit !(b+0>=m+0)}' || { [ "$EXECUTE" = 1 ] && die "balance ${BAL} XLM < required ${NEED_BAL} XLM (total + 2 reserve)" || warn "balance ${BAL} XLM < required ${NEED_BAL} XLM"; }
fi

echo
echo "  commands (verifier first, registry second):"
echo "  \$ stellar contract upload --wasm $VER_WASM --source-account $SOURCE $NETQ"
echo "  \$ stellar contract deploy --wasm-hash $VER_HASH --source-account $SOURCE $NETQ"
echo "  \$ stellar contract upload --wasm $REG_WASM --source-account $SOURCE $NETQ"
echo "  \$ stellar contract deploy --wasm-hash $REG_HASH --source-account $SOURCE $NETQ"
echo "  \$ stellar contract invoke --id <REGISTRY> --source-account $SOURCE $NETQ -- init --admin $ADMIN --verifier <VERIFIER>"
echo "  \$ node scripts/mainnet/verify-registry.mjs <tmp json>   # abort unless verifier/admin match"
echo "  \$ stellar contract invoke --id <REGISTRY> --source-account $SOURCE $NETQ -- create_chest --creator $ADMIN --fingerprint <SAMPLE_FINGERPRINT> --token $TOKEN --prize $PRIZE_STROOPS --max_claims 1 --deadline $SAMPLE_DEADLINE"
echo
echo "  NOTE: contracts/chest has a separate init() (no __constructor): deploy and init are TWO txs. Between them anyone can"
echo "        call init(own_admin, evil_verifier) and own the registry. The script inits immediately and then reads the"
echo "        instance storage back; if the verifier differs it STOPS (redeploy; the evil instance is abandoned)."

if [ "$EXECUTE" = 0 ]; then
  echo
  if [ "$OVER" = 1 ]; then echo "DRY-RUN FAILED: estimate exceeds hard cap." >&2; exit 3; fi
  if [ "$OVERRIDE" = 1 ]; then echo "DRY-RUN complete (OVERRIDE active: NOT EXECUTABLE until a real ceremony verifier hash is supplied)."; exit 0; fi
  echo "DRY-RUN complete. Re-run with --execute to send."
  exit 0
fi
[ "$OVER" = 0 ] || die "estimated total ${TOTAL} XLM exceeds hard cap ${HARD_CAP_XLM} XLM"

# ---------------------------------------------------------------- execute
LOG="$(mktemp -d)"
txhash() { rg -o 'ransaction hash is ([0-9a-f]{64})' -r '$1' "$1" 2>/dev/null | tail -1 || true; }
upload() { # name wasm expect_hash errfile
  local got; got="$(stellar contract upload --wasm "$2" --source-account "$SOURCE" "${NET[@]}" 2> >(tee "$4" >&2) | tail -1)"
  [ "$got" = "$3" ] || die "uploaded $1 hash $got != local $3 (STOP: do not continue)"
}
deploy() { # hash errfile -> contract id
  local id; id="$(stellar contract deploy --wasm-hash "$1" --source-account "$SOURCE" "${NET[@]}" 2> >(tee "$2" >&2) | tail -1)"
  [[ "$id" =~ ^C[A-Z2-7]{55}$ ]] || die "unexpected deploy output: $id"
  echo "$id"
}

step "1/7 upload verifier";  upload verifier "$VER_WASM" "$VER_HASH" "$LOG/1.err"
step "2/7 deploy verifier";  VERIFIER="$(deploy "$VER_HASH" "$LOG/2.err")"; echo "  verifier: $VERIFIER"
step "3/7 upload registry";  upload registry "$REG_WASM" "$REG_HASH" "$LOG/3.err"
step "4/7 deploy registry";  REGISTRY="$(deploy "$REG_HASH" "$LOG/4.err")"; echo "  registry: $REGISTRY"
step "5/7 init registry (front-run window: do not pause here)"
stellar contract invoke --id "$REGISTRY" --source-account "$SOURCE" "${NET[@]}" -- init --admin "$ADMIN" --verifier "$VERIFIER" 2> >(tee "$LOG/5.err" >&2) \
  || die "init failed; registry $REGISTRY is UNINITIALISED or taken. Inspect with verify-registry.mjs before retrying; do not use it unverified."

mkjson() { # sample_chest_id(or empty) sample_tx(or empty) -> stdout
  jq -n --arg pass "$PASSPHRASE" --arg rpc "$RPC_URL" --arg reg "$REGISTRY" --arg ver "$VERIFIER" --arg tok "$TOKEN" \
    --arg admin "$ADMIN" --arg vh "$VER_HASH" --arg rh "$REG_HASH" --arg fp "$SAMPLE_FP_ARG" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg cid "$1" --arg ctx "$2" \
    --arg t1 "$(txhash "$LOG/1.err")" --arg t2 "$(txhash "$LOG/2.err")" --arg t3 "$(txhash "$LOG/3.err")" \
    --arg t4 "$(txhash "$LOG/4.err")" --arg t5 "$(txhash "$LOG/5.err")" --arg prize "$PRIZE_STROOPS" '{
      network:"mainnet", passphrase:$pass, rpcUrl:$rpc,
      registry:$reg, verifier:$ver, token:$tok, admin:$admin,
      registryWasmHash:$rh, verifierWasmHash:$vh,
      sampleChest: (if $cid=="" then null else {id:($cid|tonumber), fingerprint:$fp, prizeStroops:$prize, maxClaims:1} end),
      deployedAt:$at,
      txs:{verifierUpload:$t1, verifierDeploy:$t2, registryUpload:$t3, registryDeploy:$t4, init:$t5, sampleChest:$ctx}
    }'
}
step "6/7 verify on-chain state (admin/verifier must match)"
mkjson "" "" > "$LOG/pre.json"
node "$HERE/verify-registry.mjs" "$LOG/pre.json" || die "post-init verification FAILED: registry $REGISTRY was possibly front-run. STOP. Do not create chests. Abandon it and redeploy."
mkdir -p deployments
[ ! -f "$OUT_JSON" ] || die "$OUT_JSON appeared meanwhile; refusing to overwrite"
cp "$LOG/pre.json" "$OUT_JSON"; echo "  wrote $OUT_JSON (without sample chest yet)"

step "7/7 create sample chest"
CHEST_ID="$(stellar contract invoke --id "$REGISTRY" --source-account "$SOURCE" "${NET[@]}" -- create_chest \
  --creator "$ADMIN" --fingerprint "$SAMPLE_FINGERPRINT" --token "$TOKEN" --prize "$PRIZE_STROOPS" \
  --max_claims 1 --deadline "$SAMPLE_DEADLINE" 2> >(tee "$LOG/7.err" >&2) | tail -1 | tr -d '"')"
[[ "$CHEST_ID" =~ ^[0-9]+$ ]] || die "unexpected create_chest output: $CHEST_ID (registry/verifier already recorded in $OUT_JSON)"
mkjson "$CHEST_ID" "$(txhash "$LOG/7.err")" > "$LOG/final.json"
cp "$LOG/final.json" "$OUT_JSON"
echo; echo "wrote $OUT_JSON"; jq . "$OUT_JSON"
node "$HERE/verify-registry.mjs" "$OUT_JSON" || warn "final verification reported mismatches"
echo "next: node scripts/mainnet/verify-registry.mjs"
