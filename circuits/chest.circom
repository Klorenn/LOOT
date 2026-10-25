pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// ChestZK: prueba que conoces la respuesta de un cofre sin revelarla,
// atada a tu propia cuenta (anti-copia) y con nullifier (una vez por persona y cofre).
//
// Privadas: answer, salt, playerSecret
// Públicas: chestId, recipient (entradas) + fingerprint, nullifier (salidas)
template Chest() {
    // --- privadas ---
    signal input answer;       // respuesta como field element
    signal input salt;         // sal de la creadora
    signal input playerSecret; // secreto local del jugador

    // --- públicas ---
    signal input chestId;      // id del cofre
    signal input recipient;    // cuenta que cobra, como field element

    signal output fingerprint; // Poseidon(answer, salt) — debe igualar la huella del cofre
    signal output nullifier;   // Poseidon(playerSecret, chestId) — anti doble cobro

    // huella = Poseidon(respuesta, sal)
    component hFp = Poseidon(2);
    hFp.inputs[0] <== answer;
    hFp.inputs[1] <== salt;
    fingerprint <== hFp.out;

    // nullifier = Poseidon(secreto, chestId)
    component hNul = Poseidon(2);
    hNul.inputs[0] <== playerSecret;
    hNul.inputs[1] <== chestId;
    nullifier <== hNul.out;

    // Binding del receptor: lo metemos en una restricción para que el
    // optimizador no lo descarte. Si alguien copia la prueba y cambia
    // recipient, la verificación falla.
    signal recipientSq;
    recipientSq <== recipient * recipient;
}

component main {public [chestId, recipient]} = Chest();
