"use client";

import { PasskeyClient, PasskeyKit } from "passkey-kit";
import { IndexedDBStorage } from "passkey-kit/storage";
import { NETWORK, isMainnet } from "./client-cfg";
import { ensurePasskeyFeeClamp } from "./passkey-fee-clamp";
import { WALLET_WASM_HASH } from "./network";
import { bindPasskeyWallet } from "./passkey-bind";

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

/** The kit, pointed at this passkey player's own wallet (lib/passkey-bind.ts): ready to sign, no connect prompt. */
export function playerPasskeyKit(player: { publicKey: string; keyId?: string }): PasskeyKit {
  const kit = getPasskeyKit();
  bindPasskeyWallet(kit, player.publicKey, player.keyId, (contractId) =>
    new PasskeyClient({ contractId, rpcUrl: NETWORK.rpcUrl, networkPassphrase: NETWORK.passphrase }),
  );
  return kit;
}
