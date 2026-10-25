"use client";

import { PasskeyKit } from "passkey-kit";
import { IndexedDBStorage } from "passkey-kit/storage";
import { NETWORK } from "./config";
import { ensurePasskeyFeeClamp } from "./passkey-fee-clamp";

/** Canonical smart-wallet WASM (passkey-kit docs / Protocol 27 artifact). */
export const WALLET_WASM_HASH =
  "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";

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
