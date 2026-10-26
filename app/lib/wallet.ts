"use client";

import { hash, Keypair } from "@stellar/stellar-sdk";
import { NETWORK, isMainnet } from "./client-cfg";
import { getPasskeyKit } from "./passkey-client";
import { MAINNET_PASSKEY_NOTE } from "./passkey-policy";

const STORAGE_KEY = "chestzk.player";
/** Claves de storage por red: testnet conserva las de siempre; mainnet usa un prefijo propio, así una
 *  sesión (dirección C… de passkey) de una red nunca se reutiliza en la otra. */
const sk = (k: string) => (isMainnet() ? k.replace("chestzk.", "chestzk.mainnet.") : k);
/** playerSecret por dirección: el nullifier debe ser estable aunque se cierre sesión. */
const SECRETS_KEY = "chestzk.secrets";
/** Evento de ventana que avisa a la sesión (header, wallet) que el storage cambió. */
export const SESSION_EVENT = "chestzk:session";

export type Player = {
  /** C… smart wallet or G… (classic demo keypair / Stellar Wallets Kit) */
  publicKey: string;
  /** Field element for ZK nullifier (stable per passkey / keypair) */
  playerSecret: string;
  /** passkey = C…; classic = G… demo keypair in this browser; wallet = G… via Stellar Wallets Kit */
  kind: "passkey" | "classic" | "wallet";
  /** Classic only — never set for passkey wallets */
  secretKey?: string;
  /** Passkey credential id (base64url) */
  keyId?: string;
  /** Stellar Wallets Kit module id (freighter, xbull, …) — wallet only */
  walletId?: string;
};

/** Vista pública de la sesión: passkey (C…) o cuenta G (demo o wallet externa). */
export type SessionKind = "passkey" | "g";
export function sessionKind(p: Pick<Player, "kind">): SessionKind {
  return p.kind === "passkey" ? "passkey" : "g";
}

function readSecrets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(sk(SECRETS_KEY)) || "{}");
  } catch {
    return {};
  }
}

/** Secret estable por dirección; se crea la primera vez que la dirección entra. */
export function playerSecretFor(address: string, derived?: string): string {
  const all = readSecrets();
  if (all[address]) return all[address];
  const secret = derived ?? randomFieldElement();
  try {
    localStorage.setItem(sk(SECRETS_KEY), JSON.stringify({ ...all, [address]: secret }));
  } catch {
    /* storage lleno o bloqueado: el secret vive solo en la sesión */
  }
  return secret;
}

function randomFieldElement(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(31));
  return BigInt(
    "0x" + [...rnd].map((b) => b.toString(16).padStart(2, "0")).join(""),
  ).toString();
}

function notifySession() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EVENT));
}

export class PasskeyUnavailableError extends Error {
  constructor(message = "WebAuthn unavailable on this device") {
    super(message);
    this.name = "PasskeyUnavailableError";
  }
}

export function loadPlayer(): Player | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(sk(STORAGE_KEY));
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
  localStorage.setItem(sk(STORAGE_KEY), JSON.stringify(p));
  notifySession();
}

export function clearPlayer() {
  localStorage.removeItem(sk(STORAGE_KEY));
  notifySession();
}

function secretFromBytes(label: string): string {
  const digest = hash(Buffer.from(label, "utf8"));
  const arr = Buffer.from(digest);
  arr[0] = 0;
  return BigInt("0x" + arr.toString("hex")).toString();
}

export class PasskeyMainnetError extends Error {
  constructor() {
    super(MAINNET_PASSKEY_NOTE);
    this.name = "PasskeyMainnetError";
  }
}

/** Mainnet: sin passkeys (ver lib/passkey-policy.ts). Todas las vías de passkey pasan por acá. */
export function assertPasskeyAllowed(): void {
  if (isMainnet()) throw new PasskeyMainnetError();
}

export async function submitPasskeyTx(xdr: string): Promise<string> {
  assertPasskeyAllowed();
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
export type EnrollOpts = {
  /** Registro: crea siempre una passkey nueva (no reutiliza la sesión guardada). */
  forceNew?: boolean;
  /** Progreso para la UI: passkey creada → deploy → confirmación. */
  onStage?: (
    stage: "passkey" | "deploy" | "confirm",
    info?: { address?: string },
  ) => void;
};

export class NoPasskeyAccountError extends Error {
  constructor(message = "No Loot account is linked to this passkey") {
    super(message);
    this.name = "NoPasskeyAccountError";
  }
}

export async function enrollWithPasskey(opts: EnrollOpts = {}): Promise<Player> {
  assertPasskeyAllowed();
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new PasskeyUnavailableError();
  }
  return enrollSmartWallet(opts);
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

const ACCOUNTS_KEY = "chestzk.accounts";

/** keyId (credential id) → C…; sobrevive al cierre de sesión para poder volver a entrar. */
function readAccounts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(sk(ACCOUNTS_KEY)) || "{}");
  } catch {
    return {};
  }
}

function rememberAccount(keyId: string, contractId: string) {
  try {
    localStorage.setItem(
      sk(ACCOUNTS_KEY),
      JSON.stringify({ ...readAccounts(), [keyId]: contractId }),
    );
  } catch {
    /* storage bloqueado: el login por passkey no podrá resolver esta cuenta */
  }
}

async function enrollSmartWallet(opts: EnrollOpts = {}): Promise<Player> {
  const kit = getPasskeyKit();
  const existing = loadPlayer();

  // Only reconnect when we already have a known keyId from a prior successful
  // session. Blind connectWallet() hits IndexedDB leftovers / Mercury and can
  // prompt WebAuthn auth that fails before we ever create a wallet.
  if (
    !opts.forceNew &&
    existing?.kind === "passkey" &&
    existing.keyId &&
    existing.publicKey.startsWith("C")
  ) {
    try {
      const connected = await kit.connectWallet({ keyId: existing.keyId });
      if (connected?.contractId) {
        const player: Player = {
          kind: "passkey",
          publicKey: connected.contractId,
          keyId: connected.keyIdBase64,
          playerSecret: playerSecretFor(
            connected.contractId,
            secretFromBytes(`pk:${connected.keyIdBase64}`),
          ),
        };
        rememberAccount(connected.keyIdBase64, connected.contractId);
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

  const created = await kit.createWallet("Loot", `player-${Date.now()}`, {
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

  opts.onStage?.("passkey", { address: created.contractId });
  opts.onStage?.("deploy");
  const hashTx = await submitPasskeyTx(created.signedTx);
  opts.onStage?.("confirm");
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
    playerSecret: playerSecretFor(
      created.contractId,
      secretFromBytes(`pk:${created.keyIdBase64}`),
    ),
  };
  rememberAccount(created.keyIdBase64, created.contractId);
  savePlayer(player);
  return player;
}

/**
 * Reconecta una passkey ya existente sin crear wallet: con keyId guardado no
 * pide biometría; sin él, el navegador deja elegir entre sus passkeys.
 */
export async function reconnectPasskey(): Promise<Player> {
  assertPasskeyAllowed();
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new PasskeyUnavailableError();
  }
  // passkey-kit 0.19 `connectWallet()` sin keyId crashea después de la aserción WebAuthn
  // (signer sin expiración → null.toString()). La aserción la hacemos nosotros (un prompt
  // real de Face ID / Touch ID / llave) y el contrato se resuelve con el mapa local
  // keyId → C… que se guarda al crear la cuenta. Sin indexer, una passkey sincronizada desde
  // otro dispositivo no se resuelve: queda como "sin cuenta" (NoPasskeyAccountError).
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: "preferred",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new DOMException("No credential returned", "NotAllowedError");
  const contractId = readAccounts()[cred.id];
  if (!contractId) throw new NoPasskeyAccountError();
  const player: Player = {
    kind: "passkey",
    publicKey: contractId,
    keyId: cred.id,
    playerSecret: playerSecretFor(contractId, secretFromBytes(`pk:${cred.id}`)),
  };
  savePlayer(player);
  return player;
}

/** Cuenta G… de una wallet externa (Stellar Wallets Kit). La prueba no necesita firmarla. */
export function enrollWalletAccount(address: string, walletId: string): Player {
  const player: Player = {
    kind: "wallet",
    publicKey: address,
    walletId,
    playerSecret: playerSecretFor(address),
  };
  savePlayer(player);
  return player;
}

/** Classic G… + Friendbot (demo / no biometrics). El premio es XLM: sin trustline. */
export async function enrollClassic(): Promise<Player> {
  if (!NETWORK.friendbotUrl) throw new Error("Demo accounts are testnet only.");
  const kp = Keypair.random();
  const playerSecret = playerSecretFor(kp.publicKey());

  const fund = await fetch(
    `${NETWORK.friendbotUrl}?addr=${encodeURIComponent(kp.publicKey())}`,
  );
  if (!fund.ok) throw new Error("Friendbot couldn't fund the account.");

  const player: Player = {
    kind: "classic",
    publicKey: kp.publicKey(),
    secretKey: kp.secret(),
    playerSecret,
  };
  savePlayer(player);
  return player;
}
