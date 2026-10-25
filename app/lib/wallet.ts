"use client";

import { Keypair } from "@stellar/stellar-sdk";
import { NETWORK } from "./config";
import { ensureTrustline } from "./trust";

const STORAGE_KEY = "chestzk.player";

export type Player = {
  publicKey: string;
  secretKey: string;
  playerSecret: string;
};

export function loadPlayer(): Player | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Player;
  } catch {
    return null;
  }
}

export function savePlayer(p: Player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

/** Face ID / passkey gate + cuenta local fondeada en testnet. */
export async function enrollWithPasskey(): Promise<Player> {
  if (typeof window !== "undefined" && window.PublicKeyCredential) {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "ChestZK", id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: "chestzk-player",
            displayName: "ChestZK",
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60_000,
        },
      });
    } catch {
      // Desktop sin biometría: seguimos (demo hackathon).
    }
  }

  const kp = Keypair.random();
  const rnd = crypto.getRandomValues(new Uint8Array(31));
  const playerSecret = BigInt(
    "0x" + [...rnd].map((b) => b.toString(16).padStart(2, "0")).join(""),
  ).toString();

  const fund = await fetch(
    `${NETWORK.friendbotUrl}?addr=${encodeURIComponent(kp.publicKey())}`,
  );
  if (!fund.ok) throw new Error("Friendbot no pudo fondear la cuenta");

  // Esperar a que la cuenta exista en RPC
  await new Promise((r) => setTimeout(r, 2000));
  await ensureTrustline(kp.secret());

  const player: Player = {
    publicKey: kp.publicKey(),
    secretKey: kp.secret(),
    playerSecret,
  };
  savePlayer(player);
  return player;
}
