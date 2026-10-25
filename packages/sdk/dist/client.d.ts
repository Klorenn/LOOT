import { Client, networks } from "@findloot/chest";
export type ChestzkClient = Client;
type CreateOpts = {
    contractId?: string;
    networkPassphrase?: string;
    rpcUrl?: string;
    publicKey?: string;
    allowHttp?: boolean;
};
/** Contract client for the Loot registry on testnet. */
export declare function createChestClient(opts?: CreateOpts): Client;
export { networks };
