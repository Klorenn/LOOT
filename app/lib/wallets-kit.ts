"use client";

/**
 * Stellar Wallets Kit, cargado solo en el cliente y bajo demanda: el kit usa
 * preact + window y no puede evaluarse en SSR. Solo se piden direcciones; la
 * prueba ZK se envía por el relayer, así que no se firma nada con la wallet.
 */
import { NETWORK, isMainnet } from "./client-cfg";

/**
 * LOBSTR en el móvil: el módulo `lobstr` del kit es la EXTENSIÓN de navegador (usa
 * @lobstrco/signer-extension-api), así que en un teléfono siempre aparece como "no instalado" aunque la
 * app esté. La app móvil se conecta por WalletConnect (módulo `wallet-connect` del kit, que necesita un
 * projectId de Reown/WalletConnect). Sin NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID esa opción no existe.
 */
export const WC_PROJECT_ID = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();
export const WC_WALLET_ID = "wallet_connect";
/** Id de LOBSTR en el directorio de WalletConnect/Reown (el mismo que el kit usa como destacado). */
const LOBSTR_WC_WALLET = "76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b";

export const isPhone = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** WalletConnect solo se ofrece en teléfonos y en mainnet (la app de LOBSTR no opera en testnet). */
export const wcEnabled = () => !!WC_PROJECT_ID && isMainnet() && isPhone();

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
      const wcModules: unknown[] = [];
      if (wcEnabled()) {
        const { WalletConnectModule, WalletConnectTargetChain } = await import(
          "@creit.tech/stellar-wallets-kit/modules/wallet-connect"
        );
        wcModules.push(
          new WalletConnectModule({
            projectId: WC_PROJECT_ID,
            metadata: {
              name: "Loot",
              description: "Puzzle chests with prizes only the rightful solver can claim.",
              url: window.location.origin,
              icons: [`${window.location.origin}/icon.svg`],
            },
            allowedChains: [WalletConnectTargetChain.PUBLIC],
            // el modal de Reown solo ofrece LOBSTR: deep link directo desde el teléfono
            appKitOptions: { includeWalletIds: [LOBSTR_WC_WALLET], featuredWalletIds: [LOBSTR_WC_WALLET] } as never,
          }),
        );
      }
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
          ...(wcModules as never[]),
        ],
        network: isMainnet() ? Networks.PUBLIC : Networks.TESTNET,
        // Tema Loot para el modal del kit (contraste AA: foreground/strong 15:1, secondary 7:1,
        // primary-foreground sobre primary 6.5:1, danger 6:1; light/gray solo son bordes).
        theme: {
          background: "#14131A",
          "background-secondary": "#1B1A23",
          "foreground-strong": "#F5F2EC",
          foreground: "#F5F2EC",
          "foreground-secondary": "#A6A1B0",
          primary: "#8A8CFF",
          "primary-foreground": "#0C0B10",
          transparent: "rgba(12,11,16,0)",
          lighter: "#1B1A23",
          light: "#2A2833",
          "light-gray": "#2A2833",
          gray: "#44414F",
          danger: "#FF5C61",
          border: "#2A2833",
          shadow: "none",
          "border-radius": "14px",
          "font-family": "var(--font-geist-sans), Geist, ui-sans-serif, system-ui, sans-serif",
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
  /** wallet que corre dentro de su propia app/navegador: se autoselecciona */
  isPlatformWrapper: boolean;
  type: string;
};

export class WrongNetworkError extends Error {
  /** "Mainnet", "Futurenet"… */
  networkName: string;
  constructor(networkName: string) {
    super(`Wallet is on ${networkName}`);
    this.name = "WrongNetworkError";
    this.networkName = networkName;
  }
}

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
    isPlatformWrapper: w.isPlatformWrapper,
    type: w.type,
  }));
}

/**
 * Red a la que está conectada la wallet elegida. Lanza WrongNetworkError si no es la red
 * configurada (NETWORK.passphrase); si la wallet no sabe informarla (no todas lo implementan)
 * se asume correcta.
 */
export async function assertWalletOnNetwork(walletId: string): Promise<void> {
  const kit = await loadKit();
  kit.setWallet(walletId);
  let passphrase: string | undefined;
  try {
    passphrase = (await kit.getNetwork()).networkPassphrase;
  } catch {
    return;
  }
  if (!passphrase || passphrase === NETWORK.passphrase) return;
  const name = /Public Global/i.test(passphrase)
    ? "Mainnet"
    : /Test SDF Network/i.test(passphrase)
      ? "Testnet"
    : /Future/i.test(passphrase)
      ? "Futurenet"
      : "another network";
  throw new WrongNetworkError(name);
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
  // WalletConnect no tiene "consulta en silencio": getAddress abriría el modal de conexión. La sesión
  // de WalletConnect se restaura sola al firmar.
  if (walletId === WC_WALLET_ID) return null;
  try {
    const kit = await loadKit();
    kit.setWallet(walletId);
    const { address } = await kit.selectedModule.getAddress({ skipRequestAccess: true });
    return address || null;
  } catch {
    return null;
  }
}

/** Firma un XDR clásico con la wallet elegida (Freighter, xBull…). Devuelve el XDR firmado. */
export async function signWithWallet(
  xdr: string,
  address: string,
  walletId: string,
  networkPassphrase: string,
): Promise<string> {
  const kit = await loadKit();
  kit.setWallet(walletId);
  const { signedTxXdr } = await kit.signTransaction(xdr, { networkPassphrase, address });
  return signedTxXdr;
}

export async function disconnectGWallet(): Promise<void> {
  try {
    const kit = await loadKit();
    await kit.disconnect();
  } catch {
    /* nada que desconectar */
  }
}
