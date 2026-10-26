/**
 * Fuente única de la red. NEXT_PUBLIC_STELLAR_NETWORK = "testnet" (por defecto) | "mainnet".
 * Todo lo que depende de la red (passphrase, RPC, Horizon, ids, explorer) sale de acá.
 * En mainnet los ids vienen del entorno (nada hardcodeado) y `CONFIG_ISSUES` lista lo que falta.
 */
const RAW_NET = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
export const IS_MAINNET = RAW_NET === "mainnet" || RAW_NET === "public";
export const NETWORK_ID: "mainnet" | "testnet" = IS_MAINNET ? "mainnet" : "testnet";

/** "Mainnet" | "Testnet" para textos de UI. */
export const NETWORK_LABEL = IS_MAINNET ? "Mainnet" : "Testnet";
export const NETWORK_LC = IS_MAINNET ? "mainnet" : "testnet";

/** Valor de entorno no vacío (los placeholders `...`/`S...` cuentan como vacíos). */
function env(v: string | undefined): string {
  const s = (v ?? "").trim();
  return !s || /^(\.\.\.|changeme|placeholder|todo)$/i.test(s) ? "" : s;
}

// Los NEXT_PUBLIC_* deben leerse con acceso literal para que Next los inline en el cliente.
const ENV_RPC = env(process.env.NEXT_PUBLIC_RPC_URL);
const ENV_HORIZON = env(process.env.NEXT_PUBLIC_HORIZON_URL);
const isContractId = (s: string) => /^C[A-Z2-7]{55}$/.test(s);
/** Ids inválidos (placeholders como `C...`) cuentan como no configurados. */
const validId = (s: string) => (isContractId(s) ? s : "");
const ENV_REGISTRY = validId(env(process.env.NEXT_PUBLIC_REGISTRY_ID));
const ENV_VERIFIER = validId(env(process.env.NEXT_PUBLIC_VERIFIER_ID));

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

const NETS = {
  testnet: {
    name: "TESTNET",
    passphrase: "Test SDF Network ; September 2015",
    /** Primario primero; el resto es fallback (ver lib/rpc.ts). */
    rpcUrls: uniq([
      ENV_RPC,
      "https://soroban-testnet.stellar.org",
      "https://soroban-rpc.testnet.stellar.gateway.fm",
    ]),
    horizonUrl: ENV_HORIZON || "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org" as string | null,
    explorer: "https://stellar.expert/explorer/testnet",
    xlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    registry: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
    verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
  },
  mainnet: {
    name: "MAINNET",
    passphrase: "Public Global Stellar Network ; September 2015",
    /** Primario = NEXT_PUBLIC_RPC_URL (proveedor propio); el público es solo respaldo. */
    rpcUrls: uniq([ENV_RPC, "https://mainnet.sorobanrpc.com"]),
    horizonUrl: ENV_HORIZON || "https://horizon.stellar.org",
    friendbotUrl: null as string | null,
    explorer: "https://stellar.expert/explorer/public",
    /** Asset.native().contractId(Networks.PUBLIC), verificado on-chain. */
    xlmSac: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    registry: ENV_REGISTRY,
    verifier: ENV_VERIFIER,
  },
} as const;

const N = NETS[NETWORK_ID];

export const NETWORK = {
  name: N.name,
  passphrase: N.passphrase,
  rpcUrls: N.rpcUrls as readonly string[],
  /** Timeout de las lecturas antes de probar el siguiente RPC. */
  rpcTimeoutMs: 8000,
  rpcUrl: N.rpcUrls[0] as string,
  horizonUrl: N.horizonUrl as string,
  /** Solo testnet; en mainnet es null (la UI muestra "Add XLM"). */
  friendbotUrl: N.friendbotUrl,
  explorerUrl: N.explorer as string,
};

/** Wasm canónico de la smart wallet passkey (passkey-kit); mismo hash en testnet y mainnet. */
export const WALLET_WASM_HASH =
  "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";

export const CONTRACTS = {
  /** Contrato registro (chest): en mainnet sale de NEXT_PUBLIC_REGISTRY_ID. */
  chest: N.registry as string,
  verifier: N.verifier as string,
  /** SAC del XLM nativo: token del premio. No requiere trustline. */
  token: N.xlmSac as string,
};

/** SAC del XLM nativo. */
export const XLM_SAC = CONTRACTS.token;

/** Topes de la beta en mainnet (XLM). En testnet no hay tope. Se aplican en /create. */
function cap(v: string | undefined, dflt: number): number {
  const n = Number(env(v));
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
export const CAPS = {
  maxPrizePerPlaceXlm: IS_MAINNET
    ? cap(process.env.NEXT_PUBLIC_MAX_PRIZE_PER_PLACE_XLM, 1)
    : Infinity,
  maxTotalPrizeXlm: IS_MAINNET
    ? cap(process.env.NEXT_PUBLIC_MAX_TOTAL_PRIZE_XLM, 30)
    : Infinity,
};

/** Despliegues hermanos (testnet ⇄ mainnet) para el botón de cambio de red. */
export const NETWORK_URLS = {
  testnet: env(process.env.NEXT_PUBLIC_TESTNET_URL) || "https://www.findloot.xyz",
  mainnet: env(process.env.NEXT_PUBLIC_MAINNET_URL) || "https://mainnet.findloot.xyz",
};

/** Lo que falta o está mal en la config de mainnet (vacío en testnet). Alimenta el banner rojo. */
export const CONFIG_ISSUES: string[] = IS_MAINNET
  ? [
      !ENV_RPC && "NEXT_PUBLIC_RPC_URL",
      !isContractId(ENV_REGISTRY) && "NEXT_PUBLIC_REGISTRY_ID",
      !isContractId(ENV_VERIFIER) && "NEXT_PUBLIC_VERIFIER_ID",
    ].filter((x): x is string => !!x)
  : [];
export const CONFIG_INCOMPLETE = CONFIG_ISSUES.length > 0;

export const PRIZE = {
  code: "XLM",
  decimals: 7,
  /** Premio por cupo en XLM (unidades enteras). */
  perSlot: 10,
  perSlotStroops: BigInt(10) * BigInt(10) ** BigInt(7),
} as const;

/** XLM → stroops (7 decimales), sin errores de coma flotante. */
export function xlmToStroops(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** PRIZE.decimals));
}

/** Decimales del token del premio (XLM = 7). */
export function tokenDecimals(_tokenId: string): number {
  return PRIZE.decimals;
}

/** unidades mínimas → "10" / "10.5" (sin ceros de más). */
export function stroopsToXlm(
  stroops: bigint | number | string,
  decimals: number = PRIZE.decimals,
): string {
  const v = BigInt(stroops);
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = v / unit;
  const frac = decimals
    ? (v % unit).toString().padStart(decimals, "0").replace(/0+$/, "")
    : "";
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Cofre demo para jueces / demo en vivo (pregunta sobre Stellar).
 */
export const DEMO_CHEST = {
  // #6: premio XLM nativo, 10 XLM × 10 slots (creado con bot/setup-xlm-chests.mjs).
  // La respuesta NO está en el repo: solo la sal y la huella (públicas).
  // Fallbacks desactivados: #5 (misma config XLM, pregunta anterior; ya sin uso)
  // y #2 (token CHEST, ver bloque comentado más abajo).
  /** En mainnet no hay demo: id 0 no coincide con ningún cofre (el enlace de ejemplo es SAMPLE_CHEST_ID). */
  id: IS_MAINNET ? 0 : 6,
  question:
    "What is the surname of the creator of the Stellar Consensus Protocol (SCP)?",
  hint: "French surname; accents don't matter.",
  /** Valor con el que se creó el cofre; la UI de premio lee el real de la cadena. */
  prize: PRIZE.perSlot,
  prizeLabel: `${PRIZE.perSlot} ${PRIZE.code}`,
  slots: 10,
  salt: "205785768760272112960586331553946098354073419676685343877020392339824122894",
  fingerprintHex:
    "2df98e7f97c0c16bfeac31ca35d2f9b234ab3f7b9d442d1d3b9ac45643eaab19",
} as const;

// Fallback #2 (desactivado): misma pregunta y huella, premio en el token de prueba CHEST.
// #2 uses CHEST token, 0 decimals — restore chestToken if reactivating:
//   CONTRACTS.chestToken = "CD3RI5RAQX4CB62IVD5XD6HIE5TZWJ55VF7GKAT23NPBVW3JLP6TP4AA"
//   tokenDecimals/tokenLabel must return 0 / "CHEST" for it; DEMO_CHEST.id = 2.

/**
 * Cofres que se muestran en /explore. Todo lo demás (#1 legacy, #2 CHEST, #5 retirado,
 * #7 de la demo de ataque, #8 de QA) existe on-chain pero no se lista.
 */
export const LISTED_CHEST_IDS: readonly number[] = IS_MAINNET ? [] : [DEMO_CHEST.id];

/** Cofres de prueba públicos (#9, #10, #11) que no se listan en /explore; sus páginas siguen funcionando. */
export const HIDDEN_CHEST_IDS: readonly number[] = IS_MAINNET ? [] : [9, 10, 11];

/**
 * Cofre dedicado al modo ataque (#7: 100 cupos × 0.1 XLM). La respuesta es PÚBLICA a propósito:
 * solo sirve para armar una prueba válida que el bot copia y el contrato rechaza.
 * OJO: `claim` revisa cerrado / vencido / agotado / nullifier usado ANTES de verificar la prueba,
 * así que si alguien cobra todos los cupos la demo fallaría con SoldOut en vez de InvalidProof.
 * Por eso el premio es mínimo (vaciarlo no vale nada) y hay muchos cupos. Si se agota, crear otro
 * con: ANSWER=<respuesta> SALT=7 SLOTS=100 PRIZE_STROOPS=1000000 bot/setup-xlm-chests.mjs zk
 * El premio real vive en DEMO_CHEST, cuya respuesta no está en el repo.
 */
export const ATTACK_CHEST = {
  id: 7,
  salt: "7",
  answer: "8",
} as const;

/** Cofre #1 (huella Poseidon(42,7)) — útil solo para demos de replay viejas. */
export const LEGACY_ATTACK_CHEST = {
  id: 1,
  answer: "42",
  salt: "7",
  fingerprintHex:
    "06c2f5aaf2800f039ea9ab82643ef44b84609fdb5bdad06653d147c7aff34bd5",
} as const;

/** Cofre al que apuntan los enlaces "abrir un cofre": el demo en testnet; en mainnet el cofre de muestra (id 1 del registro nuevo). */
export const SAMPLE_CHEST_ID = IS_MAINNET
  ? Number(env(process.env.NEXT_PUBLIC_SAMPLE_CHEST_ID)) || 1
  : DEMO_CHEST.id;

export const ZK_ASSETS = {
  wasm: "/zk/chest.wasm",
  zkey: "/zk/chest_final.zkey",
} as const;

/**
 * Cofre NORMAL (sin ZK) para el modo ataque: la respuesta viaja en claro.
 * Mismo premio (XLM) y misma pregunta que DEMO_CHEST; cada demo gasta 2 cupos.
 * Instancia nueva de normal-chest con token = XLM SAC (el token se fija en init).
 */
export const NORMAL_CHEST = {
  contract: IS_MAINNET ? "" : "CDMYX46WAU66OOAVXLBPTVXZ7EZF5NTS3X3T6S2AKSOADEBZD7OGEXCA",
  id: 1,
  slots: 30,
  prize: PRIZE.perSlot,
  /** Respuesta en claro a propósito: es el punto de la demo (el bot la lee del ledger). */
  answer: "8",
  /** Instancia previa (USDC/CHEST), sin uso: CAAHCYL5…B4HSV / CCDYM5LN…A5KH */
} as const;

/** Nombre legible del token de premio según su SAC. */
export function tokenLabel(tokenId: string): string {
  if (tokenId === CONTRACTS.token) return PRIZE.code;
  return "tokens";
}
