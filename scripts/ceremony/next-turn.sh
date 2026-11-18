#!/usr/bin/env bash
# Coordinator: accept contribution N and print the turn message for the next contributor.
#
#   bash scripts/ceremony/next-turn.sh <N> <zip-or-zkey URL/path> <posted sha256> [next name] [next handle]
#
# Downloads the contribution (zip or zkey), checks it is chest_<N>.zkey, that its sha256 matches what the
# contributor posted, runs `snarkjs zkey verify` (must list N contributions and end with "ZKey Ok!"),
# stores it in circuits/ceremony/multiparty-2026-12/, appends SHA256SUMS and TRANSCRIPT.md, and prints
# the EN/ES turn message for contributor N+1 with a 24 h deadline.
# Use N=0 to only print the first turn message (chest_0000.zkey is already in the repo):
#   bash scripts/ceremony/next-turn.sh 0 "" "" "<name>" "<handle>"
source "$(dirname "$0")/common.sh"

N=${1:?usage: next-turn.sh <N> <zip-or-zkey> <sha256> [next name] [next handle]}
SRC=${2:-}
POSTED=${3:-}
NEXT_NAME=${4:-<name>}
NEXT_HANDLE=${5:-}
FILE=$(name "$N")
NEXT_FILE=$(name $((N + 1)))

ensure_inputs

if [ "$N" -gt 0 ]; then
  [ -n "$SRC" ] && [ -n "$POSTED" ] || die "N>0 needs the zip/zkey link and the sha256 the contributor posted"
  [ -f "$CER/$FILE" ] && die "$FILE already accepted"
  [ -f "$CER/$(name $((N - 1)))" ] || die "previous $(name $((N - 1))) is not accepted yet"
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  if [ -f "$SRC" ]; then cp "$SRC" "$TMP/in"; else curl -fL --progress-bar -o "$TMP/in" "$SRC"; fi
  if unzip -tq "$TMP/in" >/dev/null 2>&1; then
    [ "$(unzip -Z1 "$TMP/in")" = "$FILE" ] || die "zip must contain exactly $FILE (has: $(unzip -Z1 "$TMP/in" | tr '\n' ' '))"
    unzip -q "$TMP/in" -d "$TMP/x"
  else
    mkdir "$TMP/x"; mv "$TMP/in" "$TMP/x/$FILE"
  fi
  GOT=$(sha "$TMP/x/$FILE")
  [ "$GOT" = "$POSTED" ] || die "sha256 mismatch: posted $POSTED, file $GOT"
  ok "sha256 matches the posted value"
  OUT=$(verify_zkey "$TMP/x/$FILE")
  printf '%s\n' "$OUT"
  COUNT=$(printf '%s\n' "$OUT" | rg -c -i 'contribution #' || true)
  [ "$COUNT" = "$N" ] || die "expected $N contributions in $FILE, zkey verify lists $COUNT"
  ok "$FILE verified ($N contributions)"
  cp "$TMP/x/$FILE" "$CER/$FILE"
  printf '%s  %s\n' "$GOT" "$FILE" >> "$CER/SHA256SUMS"
  [ -f "$CER/TRANSCRIPT.md" ] || printf '# Multi-party ceremony transcript (Nov 2026)\n\n| # | File | sha256 | Accepted (UTC) | Source |\n|---|---|---|---|---|\n| 0 | chest_0000.zkey | %s | 2026-11-14 | groth16 setup (deterministic) |\n' "$(sha "$CER/chest_0000.zkey")" > "$CER/TRANSCRIPT.md"
  printf '| %d | %s | %s | %s | %s |\n' "$N" "$FILE" "$GOT" "$(date -u +%Y-%m-%dT%H:%MZ)" "$SRC" >> "$CER/TRANSCRIPT.md"
  ok "stored in $CER and logged; commit it when convenient"
  PREV_URL=$SRC
  PREV_SHA=$GOT
else
  [ "$(sha "$CER/chest_0000.zkey")" = 309d64b82771a1daece987a72c0fa9234b307d1324da09d892a4293d56c34388 ] || die "chest_0000.zkey sha256 mismatch"
  PREV_URL=https://github.com/Klorenn/LOOT/raw/main/circuits/ceremony/multiparty-2026-12/chest_0000.zkey
  PREV_SHA=$(sha "$CER/chest_0000.zkey")
fi

DEADLINE=$(date -u -v+24H '+%Y-%m-%d %H:%M UTC' 2>/dev/null || date -u -d '+24 hours' '+%Y-%m-%d %H:%M UTC')
cat <<EOF

──────── message for contributor $((N + 1)) ${NEXT_HANDLE:+($NEXT_HANDLE)} ────────
Hi $NEXT_NAME! Your turn in the Loot ceremony starts now and you have 24 h (until $DEADLINE).

- Previous zkey: $PREV_URL
- File name: $FILE → you produce $NEXT_FILE
- sha256 of the zkey: $PREV_SHA

Steps (manual or with your AI agent): $ISSUE
If you use the agent prompt, fill PREV_URL, PREV_SHA256 and MY_HANDLE with the values above.
When done, post the zip, sha256, contribution hash and the declaration line on the issue from your own account, and reply here so I can pass the turn on. Thanks!

──────── español ────────
¡Hola $NEXT_NAME! Arranca tu turno en la ceremonia de Loot y tenés 24 h (hasta el $DEADLINE).

- zkey anterior: $PREV_URL
- Nombre del archivo: $FILE → vos generás $NEXT_FILE
- sha256 del zkey: $PREV_SHA

Pasos (a mano o con tu agente de IA): $ISSUE
Si usás el prompt para agentes, completá PREV_URL, PREV_SHA256 y MY_HANDLE con estos datos.
Cuando termines, publicá en el issue desde tu cuenta el zip, el sha256, el contribution hash y la frase de declaración, y avisame acá para pasarle el turno al siguiente. ¡Gracias!
EOF
