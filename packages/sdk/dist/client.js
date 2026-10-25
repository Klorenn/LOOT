import { Client, networks } from "chestzk-chest";
import { CONTRACTS, NETWORK } from "./config.js";
/** Contract client for the ChestZK registry on testnet. */
export function createChestClient(opts = {}) {
    return new Client({
        ...opts,
        contractId: opts.contractId ?? CONTRACTS.chest,
        networkPassphrase: opts.networkPassphrase ?? NETWORK.passphrase,
        rpcUrl: opts.rpcUrl ?? NETWORK.rpcUrl,
    });
}
export { networks };
