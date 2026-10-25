/** Stellar testnet defaults for ChestZK. */
export const NETWORK = {
    name: "TESTNET",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
};
/** Mirrors deployments/factory-testnet.json. */
export const CONTRACTS = {
    /** ChestFactory: one Chest contract per chest. */
    factory: "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV",
    /** Chest wasm hash the factory deploys for new chests. */
    chestWasmHash: "8cb9e4576c16967f57196944fb577eeb1ab379d6b1cad5a926e3654584f972cc",
    /** Groth16 BN254 verifier (unchanged). */
    verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE",
    /** Native XLM SAC on testnet (prize token). */
    xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    /** Testnet treasury (provided by Pau). Mainnet uses a different address: configure per network. */
    treasury: "GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ",
    /** Legacy registry contract (many chests by id). Not used by this SDK. */
    legacyRegistry: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
};
/** Fee defaults (the factory's on-chain config is the source of truth). */
export const FEES = {
    creationFeeXlm: 5,
    dailyFeeBps: 10,
    maxDurationDays: 30,
};
export const STROOPS_PER_XLM = 10000000n;
/** 10 XLM per slot in stroops (7 decimals). */
export const DEFAULT_AMOUNT_PER_SLOT_STROOPS = 100000000n;
/** Strict decimal parser: digits with at most 7 decimals; no exponent, sign or spaces. */
export function xlmToStroops(xlm) {
    const str = String(xlm);
    if (!/^\d+(\.\d{1,7})?$/.test(str)) {
        throw new Error(`invalid XLM amount "${str}" (digits with up to 7 decimals, no exponent)`);
    }
    const [i, f = ""] = str.split(".");
    return BigInt(i) * STROOPS_PER_XLM + BigInt((f + "0000000").slice(0, 7));
}
export function stroopsToXlm(s) {
    const neg = s < 0n;
    const a = neg ? -s : s;
    const i = a / STROOPS_PER_XLM;
    const f = (a % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "");
    return `${neg ? "-" : ""}${i}${f ? "." + f : ""}`;
}
