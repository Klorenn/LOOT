"use client";

import { PasskeyKit } from "passkey-kit";
import { IndexedDBStorage } from "passkey-kit/storage";
import { NETWORK, isMainnet } from "./client-cfg";
import { ensurePasskeyFeeClamp } from "./passkey-fee-clamp";
import { WALLET_WASM_HASH } from "./network";

export { WALLET_WASM_HASH };

// Un kit por red: RPC, passphrase y base IndexedDB propios (la passkey/keyId de una red no se mezcla con la otra).
const kits = new Map<string, PasskeyKit>();

export function getPasskeyKit(): PasskeyKit {
  ensurePasskeyFeeClamp();
  const net = isMainnet() ? "mainnet" : "testnet";
  let kit = kits.get(net);
  if (!kit) {
    kit = new PasskeyKit({
      rpcUrl: NETWORK.rpcUrl,
      networkPassphrase: NETWORK.passphrase,
      walletWasmHash: WALLET_WASM_HASH,
      // testnet conserva la base por defecto (sesiones existentes); mainnet usa una propia
      storage: net === "mainnet" ? new IndexedDBStorage("chestzk-mainnet-passkeys") : new IndexedDBStorage(),
      timeoutInSeconds: 30,
    });
    kits.set(net, kit);
  }
  return kit;
}
