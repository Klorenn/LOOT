"use client";

/**
 * Stellar Wallets Kit, cargado solo en el cliente y bajo demanda: el kit usa
 * preact + window y no puede evaluarse en SSR. Solo se piden direcciones; la
 * prueba ZK se envía por el relayer, así que no se firma nada con la wallet.
 */
import { NETWORK, isMainnet } from "./client-cfg";

/**
 * WalletConnect (módulo `wallet-connect` del kit, necesita un projectId de Reown/WalletConnect): es la vía
 * para las apps móviles (LOBSTR, Freighter mobile, xBull…), porque los módulos de extensión del kit nunca
 * se detectan en un teléfono. El acceso a la variable tiene que ser LITERAL (`process.env.NEXT_PUBLIC_X`):
 * Next solo sustituye ese patrón en el bundle del cliente; un acceso dinámico (`process.env[name]`) queda
 * sin sustituir. Sin la variable no hay WalletConnect: se avisa por consola y en el selector.
 */
export const WC_PROJECT_ID = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();
export const WC_WALLET_ID = "wallet_connect";
/** Ids del directorio de WalletConnect/Reown de las wallets destacadas en su modal. */
const LOBSTR_WC_WALLET = "76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b";
const FREIGHTER_WC_WALLET = "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380";
const SCOPULY_WC_WALLET = "9c78aee7d8a771255942334d06d2cbab89e2178ee49fee4ea3b6c78032fcac76";
/** El `url` de la metadata de WalletConnect debe coincidir con el dominio verificado en Reown. */
const WC_METADATA_URL = "https://www.findloot.xyz";

export const isPhone = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** WalletConnect se ofrece en escritorio y móvil, testnet y mainnet; solo requiere el projectId. */
export const wcEnabled = () => !!WC_PROJECT_ID;

/** Mensaje del kit: sus errores son objetos `{ code, message }` (no instancias de Error). */
export function walletErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m ? m : "";
}

type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let loading: Promise<Kit> | null = null;
/**
 * Kit ya cargado. Los popups (xBull, Albedo) solo se abren si `window.open` corre dentro del gesto del
 * usuario; iOS Safari lo bloquea tras un `await`. Con la instancia en una variable de módulo el click puede
 * llamar a setWallet/fetchAddress/authModal de forma síncrona (ver connectGWalletSync/authModalSync).
 */
let kitInstance: Kit | null = null;

/** Carga el kit en segundo plano (selector abierto, o ocioso en teléfonos). Nunca lanza. */
export function preloadKit(): void {
  void loadKit().catch((e) => console.warn("[wallets] kit preload failed:", e));
}

function loadKit(): Promise<Kit> {
  if (!loading) {
    loading = (async () => {
      // Sin Ledger/Trezor (flujo hardware por USB); WalletConnect se añade más abajo si hay projectId.
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
              url: WC_METADATA_URL,
              icons: [`${WC_METADATA_URL}/icon.svg`],
            },
            allowedChains: [isMainnet() ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET],
            // sin includeWalletIds: el modal de Reown lista todas las wallets Stellar; solo se destacan
            appKitOptions: { featuredWalletIds: [LOBSTR_WC_WALLET, FREIGHTER_WC_WALLET, SCOPULY_WC_WALLET] } as never,
          }),
        );
      } else {
        console.warn(
          "[wallets] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set: WalletConnect (mobile wallet apps) is disabled. " +
            "Create a project at https://dashboard.reown.com, set the variable and redeploy.",
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
      kitInstance = StellarWalletsKit;
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

/** WalletConnect inicia su SignClient en segundo plano: espera a que esté listo (no necesita gesto). */
async function waitWalletReady(kit: Kit, walletId: string): Promise<void> {
  if (walletId !== WC_WALLET_ID) return;
  for (let i = 0; i < 40; i++) {
    if (await kit.selectedModule.isAvailable()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("WalletConnect is still starting. Try again in a moment.");
}

async function fetchFrom(kit: Kit, walletId: string): Promise<{ address: string; walletId: string }> {
  await waitWalletReady(kit, walletId);
  const { address } = await kit.fetchAddress();
  return { address, walletId };
}

/** Abre el selector de wallets y devuelve la cuenta G… elegida y el id del módulo. */
export async function connectGWallet(
  walletId?: string,
): Promise<{ address: string; walletId: string }> {
  const kit = await loadKit();
  if (walletId) {
    // Wallet elegida directamente (botones Freighter / xBull): sin selector.
    kit.setWallet(walletId);
    return fetchFrom(kit, walletId);
  }
  const { address } = await kit.authModal();
  return { address, walletId: kit.selectedModule.productId };
}

/**
 * Igual que connectGWallet(id) pero SIN ningún `await` antes de setWallet/fetchAddress cuando el kit ya está
 * precargado: hay que llamarla directo desde el onClick para que el popup de xBull/Albedo conserve el gesto
 * del usuario. Si el kit aún no cargó, cae a la ruta asíncrona (puede que el navegador bloquee el popup).
 */
export function connectGWalletSync(walletId: string): Promise<{ address: string; walletId: string }> {
  const kit = kitInstance;
  if (!kit) return connectGWallet(walletId);
  try {
    kit.setWallet(walletId);
    if (walletId === WC_WALLET_ID) return fetchFrom(kit, walletId); // modal en la página, sin popup
    return kit.fetchAddress().then(({ address }) => ({ address, walletId }));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** authModal del kit llamado de forma síncrona desde el click (NEXT_PUBLIC_WALLET_MODAL=kit). */
export function authModalSync(): Promise<{ address: string; walletId: string }> {
  const kit = kitInstance;
  if (!kit) return connectGWallet();
  return kit.authModal().then(({ address }) => ({ address, walletId: kit.selectedModule.productId }));
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

/** Wallets whose Stellar Wallets Kit module cannot sign Soroban auth entries (SEP-43 signAuthEntry). */
export class AuthEntryUnsupportedError extends Error {
  constructor() {
    super("This wallet can't sign Soroban authorizations. Use Freighter, xBull, Hana or a passkey to claim.");
    this.name = "AuthEntryUnsupportedError";
  }
}

/**
 * Signs a Soroban authorization preimage (base64 HashIdPreimage XDR) with the chosen wallet.
 * Returns the raw ed25519 signature bytes (SEP-43 `signedAuthEntry`).
 */
export async function signAuthEntryWithWallet(
  preimageXdr: string,
  address: string,
  walletId: string,
  networkPassphrase: string,
): Promise<Uint8Array> {
  const kit = await loadKit();
  kit.setWallet(walletId);
  let out: { signedAuthEntry?: string };
  try {
    out = await kit.signAuthEntry(preimageXdr, { networkPassphrase, address });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    if (/not support|unsupported|not implemented/i.test(msg)) throw new AuthEntryUnsupportedError();
    throw e;
  }
  if (!out?.signedAuthEntry) throw new AuthEntryUnsupportedError();
  const bin = atob(out.signedAuthEntry);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export async function disconnectGWallet(): Promise<void> {
  try {
    const kit = await loadKit();
    await kit.disconnect();
  } catch {
    /* nada que desconectar */
  }
}
