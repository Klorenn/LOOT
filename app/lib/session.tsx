"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getPasskeyKit } from "./passkey-client";
import {
  clearPlayer,
  enrollClassic,
  enrollWalletAccount,
  enrollWithPasskey,
  loadPlayer,
  reconnectPasskey,
  SESSION_EVENT,
  sessionKind,
  type Player,
  type SessionKind,
} from "./wallet";
import {
  connectFreighter,
  connectGWallet,
  disconnectGWallet,
  restoreGWallet,
} from "./wallets-kit";

export type ConnectMethod =
  | "passkey" // reconecta o crea la passkey
  | "passkey-existing" // solo reconecta una passkey ya existente
  | "wallet" // Stellar Wallets Kit (selector)
  | "freighter" // Freighter directo, sin selector
  | "demo"; // G… efímera en este navegador

type SessionValue = {
  /** false hasta leer el storage en el cliente (evita parpadeo de "Connect"). */
  ready: boolean;
  address: string | null;
  kind: SessionKind | null;
  player: Player | null;
  connect: (method: ConnectMethod) => Promise<Player>;
  /** Borra la sesión local. NO borra la clave secreta de jugador (ver wallet.ts). */
  disconnect: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);

  // Fuente de verdad: localStorage. Cualquier savePlayer/clearPlayer emite
  // SESSION_EVENT, así que las páginas que enrolan directo también quedan sincronizadas.
  useEffect(() => {
    const sync = () => setPlayer(loadPlayer());
    sync();
    setReady(true);
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Al volver: rearmar el estado del conector sin pedir nada al usuario.
  useEffect(() => {
    if (!ready || !player) return;
    let cancelled = false;
    (async () => {
      if (player.kind === "passkey" && player.keyId) {
        try {
          await getPasskeyKit().connectWallet({ keyId: player.keyId });
        } catch (e) {
          // passkey-kit 0.19 crashea con signer sin expiración. La sesión sigue válida:
          // el claim lo envía el relayer y no necesita el estado del kit.
          console.warn("connectWallet (restore):", e);
        }
      } else if (player.kind === "wallet" && player.walletId) {
        const addr = await restoreGWallet(player.walletId);
        if (!cancelled && addr && addr !== player.publicKey) {
          // la wallet cambió de cuenta mientras tanto: la sesión sigue a la wallet
          enrollWalletAccount(addr, player.walletId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // solo al restaurar una sesión distinta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, player?.publicKey]);

  const connect = useCallback(async (method: ConnectMethod): Promise<Player> => {
    if (method === "passkey") return enrollWithPasskey();
    if (method === "passkey-existing") return reconnectPasskey();
    // enrollClassic reemplaza la sesión solo si termina bien (no se borra antes).
    if (method === "demo") return enrollClassic();
    const { address, walletId } =
      method === "freighter" ? await connectFreighter() : await connectGWallet();
    return enrollWalletAccount(address, walletId);
  }, []);

  const disconnect = useCallback(async () => {
    const current = loadPlayer();
    if (current?.kind === "wallet") await disconnectGWallet();
    clearPlayer();
    setPlayer(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      player,
      address: player?.publicKey ?? null,
      kind: player ? sessionKind(player) : null,
      connect,
      disconnect,
    }),
    [ready, player, connect, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fuera de <SessionProvider>");
  return v;
}

