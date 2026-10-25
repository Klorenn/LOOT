"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  type EnrollOpts,
  type Player,
  type SessionKind,
} from "./wallet";
import {
  connectFreighter,
  assertWalletOnTestnet,
  connectGWallet,
  disconnectGWallet,
  restoreGWallet,
} from "./wallets-kit";
import { WalletPicker } from "@/components/wallet-picker";
import { HandlePrompt } from "@/components/handle-prompt";
import { getHandle, hasSkippedHandle } from "./handle";

type EnrollOptsStage = EnrollOpts["onStage"];

export type ConnectMethod =
  | "passkey" // reconecta o crea la passkey
  | "passkey-existing" // solo reconecta una passkey ya existente
  | "passkey-new" // registro: crea siempre una passkey nueva
  | "xbull" // Stellar Wallets Kit, directo a xBull
  | "wallet" // selector de wallets de Loot (WalletPicker)
  | `wallet:${string}` // wallet concreta del kit, sin selector
  | "freighter" // Freighter directo, sin selector
  | "demo"; // G… efímera en este navegador

type SessionValue = {
  /** false hasta leer el storage en el cliente (evita parpadeo de "Connect"). */
  ready: boolean;
  address: string | null;
  kind: SessionKind | null;
  player: Player | null;
  connect: (
    method: ConnectMethod,
    onStage?: EnrollOpts["onStage"],
  ) => Promise<Player>;
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

  // Selector de wallets propio: connect("wallet") lo abre y resuelve cuando se conecta una.
  const [pickerOpen, setPickerOpen] = useState(false);
  const pending = useRef<{ res: (p: Player) => void; rej: (e: Error) => void } | null>(null);
  const openPicker = useCallback(
    () =>
      new Promise<Player>((res, rej) => {
        pending.current = { res, rej };
        setPickerOpen(true);
      }),
    [],
  );
  const pickWallet = useCallback(async (id: string) => {
    let p: Player;
    if (id === "passkey") {
      p = await enrollWithPasskey();
    } else {
      const { address, walletId } = await connectGWallet(id);
      await assertWalletOnTestnet(walletId); // WrongNetworkError: no se guarda la sesión
      p = enrollWalletAccount(address, walletId);
      try {
        localStorage.setItem("chestzk.lastWallet", walletId);
      } catch {
        /* ignorado */
      }
    }
    pending.current?.res(p);
    pending.current = null;
    setPickerOpen(false);
  }, []);
  const closePicker = useCallback(() => {
    pending.current?.rej(
      Object.assign(new Error("Wallet picker closed"), { name: "WalletPickerClosed" }),
    );
    pending.current = null;
    setPickerOpen(false);
  }, []);

  // "Pick a name?": tras conectar una wallet G (kit o demo) sin nombre y sin "Skip" previo.
  const [promptFor, setPromptFor] = useState<string | null>(null);
  const maybePrompt = useCallback((p: Player) => {
    if (p.kind !== "passkey" && !getHandle(p.publicKey) && !hasSkippedHandle(p.publicKey)) {
      setPromptFor(p.publicKey);
    }
    return p;
  }, []);

  const connectInner = useCallback(
    async (
      method: ConnectMethod,
      onStage?: EnrollOptsStage,
    ): Promise<Player> => {
    if (method === "passkey") return enrollWithPasskey();
    if (method === "passkey-new") return enrollWithPasskey({ forceNew: true, onStage });
    if (method === "passkey-existing") return reconnectPasskey();
    // enrollClassic reemplaza la sesión solo si termina bien (no se borra antes).
    if (method === "demo") return enrollClassic();
    if (method === "wallet") {
      // Por defecto: selector propio de Loot (components/wallet-picker.tsx).
      // NEXT_PUBLIC_WALLET_MODAL=kit: modal de Stellar Wallets Kit con tema Loot (fallback).
      if (process.env.NEXT_PUBLIC_WALLET_MODAL === "kit") {
        const { address, walletId } = await connectGWallet();
        return enrollWalletAccount(address, walletId);
      }
      return openPicker();
    }
    if (method.startsWith("wallet:")) {
      const { address, walletId } = await connectGWallet(method.slice(7));
      return enrollWalletAccount(address, walletId);
    }
    const { address, walletId } =
      method === "freighter"
        ? await connectFreighter()
        : await connectGWallet(method === "xbull" ? "xbull" : undefined);
    return enrollWalletAccount(address, walletId);
  },
    [openPicker],
  );

  const connect = useCallback(
    async (method: ConnectMethod, onStage?: EnrollOptsStage): Promise<Player> =>
      maybePrompt(await connectInner(method, onStage)),
    [connectInner, maybePrompt],
  );

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

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletPicker open={pickerOpen} onClose={closePicker} onSelect={pickWallet} />
      <HandlePrompt address={promptFor} onClose={() => setPromptFor(null)} />
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fuera de <SessionProvider>");
  return v;
}

