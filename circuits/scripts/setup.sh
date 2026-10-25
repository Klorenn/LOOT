#!/usr/bin/env bash
# ChestZK · compila el circuito y hace el setup Groth16 (BN254/bn128).
# Uso: ./scripts/setup.sh   (desde circuits/)
set -euo pipefail

CIRCOM="${CIRCOM:-$HOME/.local/bin/circom2}"
mkdir -p build

echo "== 1. Compilar circuito =="
"$CIRCOM" chest.circom --r1cs --wasm --sym -l node_modules -o build

echo "== 2. Powers of Tau (bn128, 2^12) =="
snarkjs powersoftau new bn128 12 build/pot_0.ptau -v
snarkjs powersoftau contribute build/pot_0.ptau build/pot_1.ptau --name="chestzk" -v -e="$(head -c 64 /dev/urandom | base64)"
snarkjs powersoftau prepare phase2 build/pot_1.ptau build/pot_final.ptau -v

echo "== 3. Setup Groth16 =="
snarkjs groth16 setup build/chest.r1cs build/pot_final.ptau build/chest_0.zkey
snarkjs zkey contribute build/chest_0.zkey build/chest_final.zkey --name="chestzk" -v -e="$(head -c 64 /dev/urandom | base64)"
snarkjs zkey export verificationkey build/chest_final.zkey build/verification_key.json

echo "== 4. Prueba de ejemplo =="
# answer=42, salt=7, playerSecret=1234, chestId=1, recipient=999 (dummy para el spike)
cat > build/input.json <<'EOF'
{
  "answer": "42",
  "salt": "7",
  "playerSecret": "1234",
  "chestId": "1",
  "recipient": "999"
}
EOF
node build/chest_js/generate_witness.js build/chest_js/chest.wasm build/input.json build/witness.wtns
snarkjs groth16 prove build/chest_final.zkey build/witness.wtns build/proof.json build/public.json
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json

echo "== OK: prueba verificada localmente =="
echo "public.json (orden: fingerprint, nullifier, chestId, recipient):"
cat build/public.json
