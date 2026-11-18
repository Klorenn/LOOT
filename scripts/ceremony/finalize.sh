#!/usr/bin/env bash
# Coordinator: apply the announced beacon to the last accepted zkey and export the verifying key.
#
#   bash scripts/ceremony/finalize.sh
#
# Run after the window closes (2026-11-29 00:00 UTC) AND after drand round R and Stellar ledger L exist
# (~2026-11-30 12:00 UTC). Anyone can rerun it to reproduce chest_final.zkey byte for byte.
#   beacon = sha256( bytes(drand randomness of round R) || bytes(hash of Stellar mainnet ledger L) ), hex
# The ledger hash must be identical on two independent Horizon servers.
# Output in circuits/ceremony/multiparty-2026-12/: chest_final.zkey, verification_key.json, BEACON.md,
# and SHA256SUMS / TRANSCRIPT.md updated.
source "$(dirname "$0")/common.sh"

ensure_inputs
[ -f "$CER/chest_final.zkey" ] && die "chest_final.zkey already exists"

LAST=$(fd -t f '^chest_[0-9]{4}\.zkey$' "$CER" | sort | tail -1)
N=$(basename "$LAST" .zkey | sed 's/chest_0*//')
[ -n "$N" ] && [ "$N" -gt 0 ] || die "no contributions accepted yet"
echo "Last accepted contribution: $(basename "$LAST") (#$N)"

# drand
DRAND=$(curl -fsS "https://api.drand.sh/$DRAND_CHAIN/public/$DRAND_ROUND") || die "drand round $DRAND_ROUND not available yet"
RAND=$(printf '%s' "$DRAND" | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d["round"]=='"$DRAND_ROUND"';print(d["randomness"])') || die "unexpected drand response"
ok "drand round $DRAND_ROUND randomness $RAND"

# Stellar ledger from two independent Horizon servers
ledger_hash() { curl -fsS "$1/ledgers/$STELLAR_LEDGER" | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d["sequence"]=='"$STELLAR_LEDGER"';print(d["hash"])'; }
H1=$(ledger_hash https://horizon.stellar.org) || die "ledger $STELLAR_LEDGER not available on horizon.stellar.org yet"
H2=$(ledger_hash https://horizon.stellar.lobstr.co) || die "ledger $STELLAR_LEDGER not available on horizon.stellar.lobstr.co"
[ "$H1" = "$H2" ] || die "Horizon servers disagree on ledger $STELLAR_LEDGER: $H1 vs $H2"
ok "Stellar ledger $STELLAR_LEDGER hash $H1 (2 Horizon servers agree)"

BEACON=$(python3 -c 'import hashlib,sys;print(hashlib.sha256(bytes.fromhex(sys.argv[1])+bytes.fromhex(sys.argv[2])).hexdigest())' "$RAND" "$H1")
ok "beacon $BEACON"

"${SNARKJS[@]}" zkey beacon "$LAST" "$CER/chest_final.zkey" "$BEACON" 10 -n="beacon drand $DRAND_ROUND + stellar $STELLAR_LEDGER"
verify_zkey "$CER/chest_final.zkey"
"${SNARKJS[@]}" zkey export verificationkey "$CER/chest_final.zkey" "$CER/verification_key.json" >/dev/null

FINAL_SHA=$(sha "$CER/chest_final.zkey")
VK_SHA=$(sha "$CER/verification_key.json")
printf '%s  %s\n%s  %s\n' "$FINAL_SHA" chest_final.zkey "$VK_SHA" verification_key.json >> "$CER/SHA256SUMS"
printf '| final | chest_final.zkey | %s | %s | beacon over %s |\n' "$FINAL_SHA" "$(date -u +%Y-%m-%dT%H:%MZ)" "$(basename "$LAST")" >> "$CER/TRANSCRIPT.md"
cat > "$CER/BEACON.md" <<EOF
# Beacon

- Input zkey: $(basename "$LAST") (contribution #$N), sha256 \`$(sha "$LAST")\`
- drand chain \`$DRAND_CHAIN\`, round $DRAND_ROUND, randomness \`$RAND\`
- Stellar mainnet ledger $STELLAR_LEDGER, hash \`$H1\` (horizon.stellar.org = horizon.stellar.lobstr.co)
- beacon = sha256(bytes(randomness) || bytes(ledger hash)) = \`$BEACON\`
- Command: \`snarkjs@0.7.6 zkey beacon $(basename "$LAST") chest_final.zkey $BEACON 10 -n="beacon drand $DRAND_ROUND + stellar $STELLAR_LEDGER"\`
- chest_final.zkey sha256 \`$FINAL_SHA\`
- verification_key.json sha256 \`$VK_SHA\`

Reproduce: \`bash scripts/ceremony/finalize.sh\` on a checkout with the same $(basename "$LAST") gives a byte-identical chest_final.zkey.
EOF
ok "done: chest_final.zkey $FINAL_SHA, verification_key.json $VK_SHA. Next: rebuild the verifier with this vk."
