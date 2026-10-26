/**
 * Registro estático del despliegue de mainnet (espejo de deployments/registry-mainnet.json + docs/MAINNET-REGISTRY.md).
 * Los ids VIVOS salen de la config (MAINNET_*); esto es lo que no se lee de la cadena: admin, txs, hashes esperados, ceremonia.
 */
export const MAINNET_RECORD = {
  admin: "GBLCVZXOJR36M5YC2EX2JU5XDPKA5PVUOJFRMPXPOIRXIQS3NDSB3SP6",
  relayer: "GBAYZE36B7N2JDHQXTCFB2ZZTGIQBNBLL5O7NACID5HPZLEIJW5KGNYW",
  registryWasm: "ddf6ce56a88681e821eeb1d7ae410687b89996a93ff7f1c266fe74a0b631b967",
  verifierWasm: "8df17eda8f2f901a9636804e0e173586723420d38af6407974218b53f98905b5",
  txs: [
    { label: "Verifier upload", hash: "2e8ffc74c2101bf696e15fe29a22afb82fd7b377ed5f4d108834a71f6e065434" },
    { label: "Verifier deploy", hash: "b9d8730cf0427a65834f1036490c89a114fb6c79ce68eaa7925513de581114a6" },
    { label: "Registry upload", hash: "60ec5c4515e8aaca528f6998d79252531b4f180fcf89d6555e4ae35b2e1d08fc" },
    { label: "Registry deploy", hash: "efa584ab7fa43fa5aea20fb1f45ecd71515a56a9faa3bbbcafad0536cf55beba" },
    { label: "init(admin, verifier)", hash: "24a48a856de1a53d6df808ce022f3403a9faccd28af32bc918d6eadea6d7cab8" },
  ],
  ceremony: {
    contributors: 1,
    beaconLedger: 65137885,
    transcriptUrl: "https://github.com/Klorenn/LOOT/blob/main/circuits/ceremony/release-2026-10-26/TRANSCRIPT.md",
  },
} as const;

/** Registro testnet que escaneó Kuyfi (reportes en public/security/kuyfi). */
export const KUYFI_SCANNED_TESTNET_REGISTRY = "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";
