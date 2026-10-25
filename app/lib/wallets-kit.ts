"use client";

/**
 * Stellar Wallets Kit, cargado solo en el cliente y bajo demanda: el kit usa
 * preact + window y no puede evaluarse en SSR. Solo se piden direcciones; la
 * prueba ZK se envía por el relayer, así que no se firma nada con la wallet.
 */
type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let loading: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!loading) {
    loading = (async () => {
      // Sin WalletConnect (pide projectId) ni Ledger/Trezor (flujo hardware por USB).
      const [
        { StellarWalletsKit },
        { Networks },
        freighter,
        xbull,
        albedo,
        lobstr,
        hana,
        rabet,
        hot,
        scopuly,
        onekey,
        bitget,
      ] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit/sdk"),
        import("@creit.tech/stellar-wallets-kit/types"),
        import("@creit.tech/stellar-wallets-kit/modules/freighter"),
        import("@creit.tech/stellar-wallets-kit/modules/xbull"),
        import("@creit.tech/stellar-wallets-kit/modules/albedo"),
        import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
        import("@creit.tech/stellar-wallets-kit/modules/hana"),
        import("@creit.tech/stellar-wallets-kit/modules/rabet"),
        import("@creit.tech/stellar-wallets-kit/modules/hotwallet"),
        import("@creit.tech/stellar-wallets-kit/modules/scopuly"),
        import("@creit.tech/stellar-wallets-kit/modules/onekey"),
        import("@creit.tech/stellar-wallets-kit/modules/bitget"),
      ]);
      StellarWalletsKit.init({
        modules: [
          new freighter.FreighterModule(),
          new xbull.xBullModule(),
          new albedo.AlbedoModule(),
          new lobstr.LobstrModule(),
          new hana.HanaModule(),
          new rabet.RabetModule(),
          new hot.HotWalletModule(),
          new scopuly.ScopulyModule(),
          new onekey.OneKeyModule(),
          new bitget.BitgetModule(),
        ],
        network: Networks.TESTNET,
        // Fallback: si algún flujo abre el modal por defecto del kit, que sea oscuro y de Loot.
        theme: {
          background: "#14131A",
          "background-secondary": "#1B1A23",
          "foreground-strong": "#F5F2EC",
          foreground: "#A6A1B0",
          "foreground-secondary": "#6F6A7A",
          primary: "#8A8CFF",
          "primary-foreground": "#0C0B10",
          transparent: "rgba(12,11,16,0)",
          lighter: "#1B1A23",
          light: "#2A2833",
          "light-gray": "#6F6A7A",
          gray: "#A6A1B0",
          danger: "#FF5C61",
          border: "#2A2833",
          shadow: "none",
          "border-radius": "10px",
          "font-family": "Geist, ui-sans-serif, system-ui, sans-serif",
        },
      });
      return StellarWalletsKit;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export type WalletOption = {
  id: string;
  name: string;
  icon: string;
  url: string;
  isAvailable: boolean;
  type: string;
};

/** Wallets soportadas por el kit con su estado de detección (para nuestro selector). */
export async function listWallets(): Promise<WalletOption[]> {
  const kit = await loadKit();
  const list = await kit.refreshSupportedWallets();
  return list.map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    url: w.url,
    isAvailable: w.isAvailable,
    type: w.type,
  }));
}

/** Abre el selector de wallets y devuelve la cuenta G… elegida y el id del módulo. */
export async function connectGWallet(
  walletId?: string,
): Promise<{ address: string; walletId: string }> {
  const kit = await loadKit();
  if (walletId) {
    // Wallet elegida directamente (botones Freighter / xBull): sin selector.
    kit.setWallet(walletId);
    const { address } = await kit.fetchAddress();
    return { address, walletId };
  }
  const { address } = await kit.authModal();
  return { address, walletId: kit.selectedModule.productId };
}

export class FreighterUnavailableError extends Error {
  constructor() {
    super("Freighter isn't installed or is disabled in this browser. Get it at freighter.app.");
    this.name = "FreighterUnavailableError";
  }
}

/** Conecta Freighter directo, sin selector. La extensión pide permiso si hace falta. */
export async function connectFreighter(): Promise<{ address: string; walletId: string }> {
  const [kit, { FREIGHTER_ID }] = await Promise.all([
    loadKit(),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
  ]);
  kit.setWallet(FREIGHTER_ID);
  if (!(await kit.selectedModule.isAvailable())) throw new FreighterUnavailableError();
  const { address } = await kit.fetchAddress();
  return { address, walletId: FREIGHTER_ID };
}

/**
 * Vuelve a enlazar la wallet recordada sin abrir el selector. Devuelve la
 * dirección que la wallet reporta ahora, o null si no se pudo consultar en
 * silencio (extensión bloqueada, sin permiso, etc.).
 */
export async function restoreGWallet(walletId: string): Promise<string | null> {
  try {
    const kit = await loadKit();
    kit.setWallet(walletId);
    const { address } = await kit.selectedModule.getAddress({ skipRequestAccess: true });
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectGWallet(): Promise<void> {
  try {
    const kit = await loadKit();
    await kit.disconnect();
  } catch {
    /* nada que desconectar */
  }
}
