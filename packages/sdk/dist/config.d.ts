/** Stellar testnet defaults for ChestZK. */
export declare const NETWORK: {
    readonly name: "TESTNET";
    readonly passphrase: "Test SDF Network ; September 2015";
    readonly rpcUrl: "https://soroban-testnet.stellar.org";
    readonly horizonUrl: "https://horizon-testnet.stellar.org";
    readonly friendbotUrl: "https://friendbot.stellar.org";
};
export declare const CONTRACTS: {
    /** Registry ChestZk (many chests by id). */
    readonly chest: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";
    readonly verifier: "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE";
    /** Native XLM SAC on testnet. */
    readonly xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
};
/** 10 XLM per slot in stroops (7 decimals). */
export declare const DEFAULT_AMOUNT_PER_SLOT_STROOPS = 100000000n;
