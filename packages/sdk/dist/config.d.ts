/** Stellar testnet defaults for ChestZK. */
export declare const NETWORK: {
    readonly name: "TESTNET";
    readonly passphrase: "Test SDF Network ; September 2015";
    readonly rpcUrl: "https://soroban-testnet.stellar.org";
    readonly horizonUrl: "https://horizon-testnet.stellar.org";
    readonly friendbotUrl: "https://friendbot.stellar.org";
};
/** Mirrors deployments/factory-testnet.json. */
export declare const CONTRACTS: {
    /** ChestFactory: one Chest contract per chest. */
    readonly factory: "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV";
    /** Chest wasm hash the factory deploys for new chests. */
    readonly chestWasmHash: "8cb9e4576c16967f57196944fb577eeb1ab379d6b1cad5a926e3654584f972cc";
    /** Groth16 BN254 verifier (unchanged). */
    readonly verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE";
    /** Native XLM SAC on testnet (prize token). */
    readonly xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    /** Testnet treasury (provided by Pau). Mainnet uses a different address: configure per network. */
    readonly treasury: "GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ";
    /** Legacy registry contract (many chests by id). Not used by this SDK. */
    readonly legacyRegistry: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";
};
/** Fee defaults (the factory's on-chain config is the source of truth). */
export declare const FEES: {
    readonly creationFeeXlm: 5;
    readonly dailyFeeBps: 10;
    readonly maxDurationDays: 30;
};
export declare const STROOPS_PER_XLM = 10000000n;
/** 10 XLM per slot in stroops (7 decimals). */
export declare const DEFAULT_AMOUNT_PER_SLOT_STROOPS = 100000000n;
/** Strict decimal parser: digits with at most 7 decimals; no exponent, sign or spaces. */
export declare function xlmToStroops(xlm: number | string): bigint;
export declare function stroopsToXlm(s: bigint): string;
