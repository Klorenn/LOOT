# chestzk

SDK for [ChestZK](https://github.com/Klorenn/ChestZK) — puzzle chests on Stellar with ZK proofs sealed to the solver’s address.

Prize token for the demo: **native XLM** (no swaps).

```bash
npm i chestzk
```

```ts
import {
  createChestClient,
  fingerprintAnswer,
  CONTRACTS,
  NETWORK,
} from "chestzk";

const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);
const client = createChestClient({
  rpcUrl: NETWORK.rpcUrl,
  networkPassphrase: NETWORK.passphrase,
  publicKey: "G…", // or C… smart account
});

// client.create_chest / get_chest / claim / close — via generated bindings
console.log(fingerprintHex, CONTRACTS.xlm);
```

## Notes

- Answers are normalized (`trim`, lowercase, strip accents/spaces) before hashing.
- Full browser `claim` (snarkjs + passkey/wallet) lives in the app; this package ships config, fingerprint helpers, and the Soroban client.
- Scoped `@chestzk/sdk` can replace this name once the npm org exists.

MIT · https://github.com/Klorenn/ChestZK
