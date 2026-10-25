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
 * Passkey smart wallet (C…) via passkey-kit + fee-sponsored deploy.
 * Falls back to classic G… + Friendbot if WebAuthn / deploy fails (desktop demo).
 */
export async function enrollWithPasskey(): Promise<Player> {
  try {
    return await enrollSmartWallet();
  } catch (e) {
    console.warn("passkey smart wallet failed, classic fallback:", e);
    return enrollClassic();
  }
}

async function enrollSmartWallet(): Promise<Player> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("WebAuthn unavailable");
  }

  const kit = getPasskeyKit();

  // Returning user (IndexedDB / indexer)
  try {
    const existing = loadPlayer();
    const connected = await kit.connectWallet(
      existing?.keyId ? { keyId: existing.keyId } : undefined,
    );
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
  } catch {
    // no existing wallet — create
  }

  const created = await kit.createWallet("ChestZK", `player-${Date.now()}`);
  const hashTx = await submitPasskeyTx(created.signedTx);
  await kit.confirmWalletCreation(created, hashTx);
  await kit.connectWallet({ keyId: created.keyIdBase64 });

  const player: Player = {
    kind: "passkey",
    publicKey: created.contractId,
    keyId: created.keyIdBase64,
    playerSecret: secretFromBytes(`pk:${created.keyIdBase64}`),
  };
  savePlayer(player);
  return player;
}

async function enrollClassic(): Promise<Player> {
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
