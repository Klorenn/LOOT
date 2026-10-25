"use client";

import { PasskeyKit } from "passkey-kit";
import { IndexedDBStorage } from "passkey-kit/storage";
import { NETWORK, WALLET_WASM_HASH } from "./config";
import { ensurePasskeyFeeClamp } from "./passkey-fee-clamp";

export { WALLET_WASM_HASH };

let kit: PasskeyKit | null = null;

export function getPasskeyKit(): PasskeyKit {
  ensurePasskeyFeeClamp();
  if (!kit) {
    kit = new PasskeyKit({
      rpcUrl: NETWORK.rpcUrl,
      networkPassphrase: NETWORK.passphrase,
      walletWasmHash: WALLET_WASM_HASH,
      storage: new IndexedDBStorage(),
      timeoutInSeconds: 30,
    });
  }
  return kit;
}
