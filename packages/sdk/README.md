# @findloot/sdk

SDK for [Loot](https://github.com/Klorenn/LOOT) — puzzle chests on Stellar with ZK proofs sealed to the solver’s address.

```bash
npm i @findloot/sdk
```

```ts
import {
  createChestClient,
  fingerprintAnswer,
  CONTRACTS,
  NETWORK,
} from "@findloot/sdk";

const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);
const client = createChestClient({
  rpcUrl: NETWORK.rpcUrl,
  networkPassphrase: NETWORK.passphrase,
  publicKey: "G…",
});

console.log(fingerprintHex, CONTRACTS.xlm);
```

Bindings live in `@findloot/chest`.

MIT · https://github.com/Klorenn/LOOT
