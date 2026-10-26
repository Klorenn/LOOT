import { parseCreatorAllowlist } from "./meta-gate";

/**
 * Redes de Loot. findloot.xyz sirve testnet Y mainnet: la red se elige por petición con la cookie
 * `loot_net` (testnet por defecto). Este módulo es puro (sin next/headers) y vale en servidor y cliente.
 *  - servidor: `cfg()` de lib/cfg.ts (cookie de la petición) o `configFor(net)` con la red explícita;
 *  - cliente: `useNet()` (contexto, también durante el SSR) o `clientCfg()` en handlers/lib.
 * Mainnet se configura por entorno (MAINNET_REGISTRY_ID, MAINNET_VERIFIER_ID, MAINNET_RPC_URL…); si falta
 * algo, `mainnetReady` es false y el selector muestra "Mainnet (coming soon)".
 */
export type Net = "testnet" | "mainnet";
export const NET_COOKIE = "loot_net";
export const DEFAULT_NET: Net = (process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet") as Net;

/** Parte pública de la config de mainnet: la lee el servidor del entorno y se inyecta al cliente. */
export type MainnetPublic = {
  registry: string;
  verifier: string;
  rpcUrl: string;
  horizonUrl: string;
  maxPrizePerPlaceXlm: number;
  maxTotalPrizeXlm: number;
  /** Cofre al que apuntan los enlaces "abrir un cofre" en mainnet. */
  sampleChestId: number;
  /** Ids extra permitidos en mainnet (MAINNET_LISTED_IDS, csv). */
  listedIds: number[];
  /** Creadores aprobados (MAINNET_CREATOR_ALLOWLIST): sus cofres se listan y el relayer los patrocina. */
  creatorAllowlist: string[];
  /** MAINNET_PASSKEY_ENABLED=true: cuentas passkey en mainnet (apagado por defecto). */
  passkeyEnabled: boolean;
};

const isContractId = (s: string) => /^C[A-Z2-7]{55}$/.test(s);
const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return !s || /^(\.\.\.|changeme|placeholder|todo)$/i.test(s) ? "" : s;
};
const num = (v: string | undefined, d: number) => {
  const n = Number(clean(v));
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Solo servidor (en el cliente las MAINNET_* no existen: se usa lo inyectado). */
export function mainnetPublicFromEnv(): MainnetPublic {
  const e = process.env;
  return {
    registry: clean(e.MAINNET_REGISTRY_ID),
    verifier: clean(e.MAINNET_VERIFIER_ID),
    rpcUrl: clean(e.MAINNET_RPC_URL),
    horizonUrl: clean(e.MAINNET_HORIZON_URL),
    maxPrizePerPlaceXlm: num(e.MAINNET_MAX_PRIZE_PER_PLACE_XLM ?? e.NEXT_PUBLIC_MAX_PRIZE_PER_PLACE_XLM, 1),
    maxTotalPrizeXlm: num(e.MAINNET_MAX_TOTAL_PRIZE_XLM ?? e.NEXT_PUBLIC_MAX_TOTAL_PRIZE_XLM, 30),
    // sin MAINNET_SAMPLE_CHEST_ID no hay cofre de muestra (0): ya no se asume el #1, que cualquiera puede crear
    sampleChestId: num(e.MAINNET_SAMPLE_CHEST_ID, 0),
    creatorAllowlist: parseCreatorAllowlist(e.MAINNET_CREATOR_ALLOWLIST),
    passkeyEnabled: clean(e.MAINNET_PASSKEY_ENABLED).toLowerCase() === "true",
    listedIds: (clean(e.MAINNET_LISTED_IDS) || "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isSafeInteger(n) && n > 0),
  };
}

export type NetConfig = {
  net: Net;
  IS_MAINNET: boolean;
  NETWORK_LABEL: "Testnet" | "Mainnet";
  NETWORK_LC: "testnet" | "mainnet";
  NETWORK: {
    name: string;
    passphrase: string;
    rpcUrls: readonly string[];
    rpcTimeoutMs: number;
    rpcUrl: string;
    horizonUrl: string;
    friendbotUrl: string | null;
    explorerUrl: string;
  };
  CONTRACTS: { chest: string; verifier: string; token: string };
  XLM_SAC: string;
  CAPS: { maxPrizePerPlaceXlm: number; maxTotalPrizeXlm: number };
  /** Id del cofre demo (testnet: 6). En mainnet 0 = no hay demo (no coincide con ningún cofre). */
  DEMO_CHEST_ID: number;
  /** Cofre al que apuntan los enlaces "abrir un cofre". */
  SAMPLE_CHEST_ID: number;
  /** Creadores aprobados en mainnet (vacío en testnet). */
  CREATOR_ALLOWLIST: readonly string[];
  /** Ids de cofre que mainnet muestra y deja reclamar/cerrar vía relayer. null = sin lista (testnet). */
  ALLOWED_CHEST_IDS: readonly number[] | null;
  LISTED_CHEST_IDS: readonly number[];
  HIDDEN_CHEST_IDS: readonly number[];
  /** Lo que falta en la config de la red activa (siempre vacío en testnet). */
  CONFIG_ISSUES: string[];
  CONFIG_INCOMPLETE: boolean;
  /** ¿Mainnet está configurada? (habilita el selector). */
  mainnetReady: boolean;
  /** ¿Se admiten cuentas passkey en la red activa? Testnet siempre; mainnet solo con MAINNET_PASSKEY_ENABLED=true. */
  PASSKEY_ENABLED: boolean;
};

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const TESTNET_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
/** Asset.native().contractId(Networks.PUBLIC), verificado on-chain. */
const MAINNET_SAC = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

/** Wasm canónico de la smart wallet passkey (passkey-kit); mismo hash en testnet y mainnet. */
export const WALLET_WASM_HASH = "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";

/** Config por red. `mainnet` = parte pública de mainnet (entorno en servidor, inyectada en cliente). */
export function configFor(net: Net, mainnet: MainnetPublic): NetConfig {
  const issues = [
    !mainnet.rpcUrl && "MAINNET_RPC_URL",
    !isContractId(mainnet.registry) && "MAINNET_REGISTRY_ID",
    !isContractId(mainnet.verifier) && "MAINNET_VERIFIER_ID",
  ].filter((x): x is string => !!x);
  const mainnetReady = issues.length === 0;

  if (net === "mainnet") {
    const rpcUrls = uniq([mainnet.rpcUrl, "https://mainnet.sorobanrpc.com"]);
    const registry = isContractId(mainnet.registry) ? mainnet.registry : "";
    const verifier = isContractId(mainnet.verifier) ? mainnet.verifier : "";
    return {
      net,
      IS_MAINNET: true,
      NETWORK_LABEL: "Mainnet",
      NETWORK_LC: "mainnet",
      NETWORK: {
        name: "MAINNET",
        passphrase: "Public Global Stellar Network ; September 2015",
        rpcUrls,
        rpcTimeoutMs: 8000,
        rpcUrl: rpcUrls[0],
        horizonUrl: mainnet.horizonUrl || "https://horizon.stellar.org",
        friendbotUrl: null,
        explorerUrl: "https://stellar.expert/explorer/public",
      },
      CONTRACTS: { chest: registry, verifier, token: MAINNET_SAC },
      XLM_SAC: MAINNET_SAC,
      CAPS: { maxPrizePerPlaceXlm: mainnet.maxPrizePerPlaceXlm, maxTotalPrizeXlm: mainnet.maxTotalPrizeXlm },
      DEMO_CHEST_ID: 0,
      SAMPLE_CHEST_ID: mainnet.sampleChestId || 1, // solo para enlaces "abrir un cofre"; no habilita nada
      CREATOR_ALLOWLIST: mainnet.creatorAllowlist,
      ALLOWED_CHEST_IDS: [...new Set([mainnet.sampleChestId, ...mainnet.listedIds].filter((n) => n > 0))],
      LISTED_CHEST_IDS: [...new Set([mainnet.sampleChestId, ...mainnet.listedIds].filter((n) => n > 0))],
      HIDDEN_CHEST_IDS: [],
      CONFIG_ISSUES: issues,
      CONFIG_INCOMPLETE: !mainnetReady,
      mainnetReady,
      PASSKEY_ENABLED: mainnet.passkeyEnabled,
    };
  }

  const envRpc = clean(process.env.NEXT_PUBLIC_RPC_URL);
  const rpcUrls = uniq([envRpc, "https://soroban-testnet.stellar.org", "https://soroban-rpc.testnet.stellar.gateway.fm"]);
  return {
    net,
    IS_MAINNET: false,
    NETWORK_LABEL: "Testnet",
    NETWORK_LC: "testnet",
    NETWORK: {
      name: "TESTNET",
      passphrase: "Test SDF Network ; September 2015",
      rpcUrls,
      rpcTimeoutMs: 8000,
      rpcUrl: rpcUrls[0],
      horizonUrl: clean(process.env.NEXT_PUBLIC_HORIZON_URL) || "https://horizon-testnet.stellar.org",
      friendbotUrl: "https://friendbot.stellar.org",
      explorerUrl: "https://stellar.expert/explorer/testnet",
    },
    CONTRACTS: {
      chest: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
      verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
      token: TESTNET_SAC,
    },
    XLM_SAC: TESTNET_SAC,
    CAPS: { maxPrizePerPlaceXlm: Infinity, maxTotalPrizeXlm: Infinity },
    DEMO_CHEST_ID: 6,
    SAMPLE_CHEST_ID: 6,
    CREATOR_ALLOWLIST: [],
    ALLOWED_CHEST_IDS: null,
    LISTED_CHEST_IDS: [6],
    HIDDEN_CHEST_IDS: [9, 10, 11],
    CONFIG_ISSUES: [],
    CONFIG_INCOMPLETE: false,
    mainnetReady,
    PASSKEY_ENABLED: true,
  };
}

export const parseNet = (v: string | null | undefined): Net | null => (v === "mainnet" || v === "testnet" ? v : null);

/** Enlace para compartir: siempre lleva ?net=<red> (el #fragmento, que puede traer la sal privada, se conserva). */
export function withNet(url: string, net: Net): string {
  const u = new URL(url);
  u.searchParams.set("net", net);
  return u.toString();
}

/** Cookie de red del navegador. */
export function readNetCookie(cookieHeader: string | undefined | null): Net | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${NET_COOKIE}=([^;]+)`));
  return parseNet(m?.[1]);
}

/** Red efectiva: cookie válida (mainnet solo si está configurada) o testnet. */
export function effectiveNet(cookieNet: Net | null, mainnet: MainnetPublic): Net {
  const want = cookieNet ?? DEFAULT_NET;
  return want === "mainnet" && configFor("mainnet", mainnet).mainnetReady ? "mainnet" : "testnet";
}

/** Mainnet inyectada en el cliente por NetworkProvider (config pública; el servidor usa el entorno). */
let injected: MainnetPublic | null = null;
export function injectMainnet(m: MainnetPublic) {
  injected = m;
}
export function mainnetPublic(): MainnetPublic {
  if (typeof window === "undefined") return mainnetPublicFromEnv();
  return (
    injected ?? { registry: "", verifier: "", rpcUrl: "", horizonUrl: "", maxPrizePerPlaceXlm: 1, maxTotalPrizeXlm: 30, sampleChestId: 0, listedIds: [], creatorAllowlist: [], passkeyEnabled: false }
  );
}

/** Solo cliente (handlers, lib de navegador): config de la red de la cookie. */
export function clientCfg(): NetConfig {
  if (typeof window === "undefined") throw new Error("clientCfg() is browser-only; use cfg() on the server");
  const m = mainnetPublic();
  return configFor(effectiveNet(readNetCookie(document.cookie), m), m);
}

/** Cambia de red en el navegador y recarga la página (conserva ruta y query; nunca el #fragmento). */
export function switchNetwork(to: Net) {
  document.cookie = `${NET_COOKIE}=${to}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
