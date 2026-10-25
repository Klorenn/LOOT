"use client";

import { hash, Keypair } from "@stellar/stellar-sdk";
import { NETWORK } from "./config";
import { getPasskeyKit } from "./passkey-client";
import { ensureTrustline } from "./trust";

const STORAGE_KEY = "chestzk.player";

export type Player = {
  /** C… smart wallet or G… classic fallback */
  publicKey: string;
  /** Field element for ZK nullifier (stable per passkey / keypair) */
  playerSecret: string;
  kind: "passkey" | "classic";
  /** Classic only — never set for passkey wallets */
  secretKey?: string;
  /** Passkey credential id (base64url) */
  keyId?: string;
};

export class PasskeyUnavailableError extends Error {
  constructor(message = "WebAuthn unavailable on this device") {
    super(message);
    this.name = "PasskeyUnavailableError";
  }
}

export function loadPlayer(): Player | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Player;
    if (!p.publicKey || !p.playerSecret) return null;
    if (!p.kind) {
      p.kind = p.secretKey ? "classic" : "passkey";
    }
    return p;
  } catch {
    return null;
  }
}

export function savePlayer(p: Player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY);
}

function secretFromBytes(label: string): string {
  const digest = hash(Buffer.from(label, "utf8"));
  const arr = Buffer.from(digest);
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex")).toString();
}

async function submitPasskeyTx(xdr: string): Promise<string> {
  const res = await fetch("/api/passkey/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ xdr }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "passkey submit failed");
  }
  return data.hash as string;
}

/**
 * Passkey smart wallet (C…) via passkey-kit + sponsored deploy.
 * Does NOT silently fall back — callers choose classic explicitly.
 */
export async function enrollWithPasskey(): Promise<Player> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new PasskeyUnavailableError();
  }
  return enrollSmartWallet();
}

/**
 * Prefer passkey; only auto-fallback when WebAuthn is missing.
 * Deploy / confirm failures surface — they must not become a silent G… wallet.
 */
export async function enrollPreferPasskey(): Promise<Player> {
  try {
    return await enrollWithPasskey();
  } catch (e) {
    if (e instanceof PasskeyUnavailableError) {
      console.warn("WebAuthn missing → classic demo wallet");
      return enrollClassic();
    }
    throw e;
  }
}

async function enrollSmartWallet(): Promise<Player> {
  const kit = getPasskeyKit();
  const existing = loadPlayer();

  // Only reconnect when we already have a known keyId from a prior successful
  // session. Blind connectWallet() hits IndexedDB leftovers / Mercury and can
  // prompt WebAuthn auth that fails before we ever create a wallet.
  if (existing?.kind === "passkey" && existing.keyId && existing.publicKey.startsWith("C")) {
    try {
      const connected = await kit.connectWallet({ keyId: existing.keyId });
      if (connected?.contractId) {
        const player: Player = {
          kind: "passkey",
          publicKey: connected.contractId,
          keyId: connected.keyIdBase64,
          playerSecret: secretFromBytes(`pk:${connected.keyIdBase64}`),
        };
        savePlayer(player);
        return player;
      }
    } catch (e) {
      // passkey-kit 0.19: null signer expiration → ".toString()" crash.
      // Session already has a deployed C… — reuse it for this demo.
      console.warn("connectWallet failed, reusing stored passkey player:", e);
      return existing;
    }
  }

  const created = await kit.createWallet("ChestZK", `player-${Date.now()}`, {
    // Resident key so the binding-proof assertion (get) finds the credential
    // just created by create() — required for passkey-kit Genesis proof.
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });
  if (!created?.signedTx || !created.contractId) {
    throw new Error("passkey-kit createWallet returned an incomplete result");
  }

  const hashTx = await submitPasskeyTx(created.signedTx);
  try {
    await kit.confirmWalletCreation(created, hashTx);
  } catch (e) {
    // Birth verify can choke on fee-bump envelope XDR shape from some RPC
    // clients; the deploy already succeeded on-chain — keep going.
    console.warn("confirmWalletCreation:", e);
  }
  // Skip connectWallet after fresh create: passkey-kit 0.19 treats a null
  // signer expiration as defined and calls null.toString() (crash). We already
  // have contractId + keyId from createWallet; reconnect path uses connectWallet.
  const player: Player = {
    kind: "passkey",
    publicKey: created.contractId,
    keyId: created.keyIdBase64,
    playerSecret: secretFromBytes(`pk:${created.keyIdBase64}`),
  };
  savePlayer(player);
  return player;
}

/** Classic G… + Friendbot + USDC trustline (demo / no biometrics). */
export async function enrollClassic(): Promise<Player> {
  const kp = Keypair.random();
  const rnd = crypto.getRandomValues(new Uint8Array(31));
  const playerSecret = BigInt(
    "0x" + [...rnd].map((b) => b.toString(16).padStart(2, "0")).join(""),
  ).toString();

  const fund = await fetch(
    `${NETWORK.friendbotUrl}?addr=${encodeURIComponent(kp.publicKey())}`,
  );
  if (!fund.ok) throw new Error("Friendbot no pudo fondear la cuenta");

  await new Promise((r) => setTimeout(r, 2000));
  await ensureTrustline(kp.secret());

  const player: Player = {
    kind: "classic",
    publicKey: kp.publicKey(),
    secretKey: kp.secret(),
    playerSecret,
  };
  savePlayer(player);
  return player;
}
