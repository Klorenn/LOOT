# loot

SDK for [Loot](https://github.com/Klorenn/LOOT) — puzzle chests on Stellar with ZK proofs sealed to the solver’s address.

(Formerly ChestZK.) Prize token for the demo: **native XLM** (no swaps).

```bash
npm i loot
```

```ts
import {
  createChestClient,
  fingerprintAnswer,
  CONTRACTS,
  NETWORK,
} from "loot";

const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);
const client = createChestClient({
  rpcUrl: NETWORK.rpcUrl,
  networkPassphrase: NETWORK.passphrase,
  publicKey: "G…",
});

console.log(fingerprintHex, CONTRACTS.xlm);
```

MIT · https://github.com/Klorenn/LOOT
