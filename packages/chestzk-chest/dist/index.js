import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
if (typeof window !== "undefined") {
    //@ts-ignore Buffer exists
    window.Buffer = window.Buffer || Buffer;
}
export const networks = {
    testnet: {
        networkPassphrase: "Test SDF Network ; September 2015",
        contractId: "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ",
    }
};
export const Errors = {
    1: { message: "ChestNotFound" },
    2: { message: "ChestClosed" },
    3: { message: "ChestExpired" },
    4: { message: "SoldOut" },
    5: { message: "NullifierUsed" },
    6: { message: "InvalidProof" },
    7: { message: "NotCreator" },
    8: { message: "StillActive" },
    9: { message: "BadAmounts" },
    10: { message: "AlreadyInit" },
    11: { message: "NotInit" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy(null, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAQAAAAAAAAAAAAAABUNoZXN0AAAAAAAACAAAAAAAAAAGY2xhaW1zAAAAAAAEAAAAAAAAAAZjbG9zZWQAAAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAAAAAAAKbWF4X2NsYWltcwAAAAAABAAAAAAAAAAFcHJpemUAAAAAAAALAAAAAAAAAAV0b2tlbgAAAAAAABM=",
            "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAANQ2hlc3ROb3RGb3VuZAAAAAAAAAEAAAAAAAAAC0NoZXN0Q2xvc2VkAAAAAAIAAAAAAAAADENoZXN0RXhwaXJlZAAAAAMAAAAAAAAAB1NvbGRPdXQAAAAABAAAAAAAAAANTnVsbGlmaWVyVXNlZAAAAAAAAAUAAAAAAAAADEludmFsaWRQcm9vZgAAAAYAAAAAAAAACk5vdENyZWF0b3IAAAAAAAcAAAAAAAAAC1N0aWxsQWN0aXZlAAAAAAgAAAAAAAAACkJhZEFtb3VudHMAAAAAAAkAAAAAAAAAC0FscmVhZHlJbml0AAAAAAoAAAAAAAAAB05vdEluaXQAAAAACw==",
            "AAAAAQAAAHJXaXJlLWNvbXBhdGlibGUgY29uIGVsIGBQcm9vZmAgZGVsIHZlcmlmaWNhZG9yIGdlbmVyYWRvCihhOiBHMSA2NEIsIGI6IEcyIDEyOEIsIGM6IEcxIDY0QiwgZXRoZXJldW0tdW5jb21wcmVzc2VkKS4AAAAAAAAAAAAFUHJvb2YAAAAAAAADAAAAAAAAAAFhAAAAAAAD7gAAAEAAAAAAAAAAAWIAAAAAAAPuAAAAgAAAAAAAAAABYwAAAAAAA+4AAABA",
            "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAACFZlcmlmaWVyAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAVDaGVzdAAAAAAAAAEAAAAGAAAAAQAAAAAAAAAJTnVsbGlmaWVyAAAAAAAAAQAAA+4AAAAg",
            "AAAAAAAAAAAAAAAEaW5pdAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
            "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAEAAAAAAAAAAhjaGVzdF9pZAAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAABAAAD6QAAAAIAAAAD",
            "AAAAAAAAAAAAAAAJZ2V0X2NoZXN0AAAAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAfQAAAABUNoZXN0AAAAAAAAAw==",
            "AAAAAAAAAAAAAAALY2xvc2VfY2hlc3QAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAALAAAAAw==",
            "AAAAAAAAAAAAAAAMY3JlYXRlX2NoZXN0AAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAVwcml6ZQAAAAAAAAsAAAAAAAAACm1heF9jbGFpbXMAAAAAAAQAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAPpAAAABgAAAAM="]), options);
        this.options = options;
    }
    fromJSON = {
        init: (this.txFromJSON),
        claim: (this.txFromJSON),
        get_chest: (this.txFromJSON),
        close_chest: (this.txFromJSON),
        create_chest: (this.txFromJSON)
    };
}
/** Registry v2 (sets, constructor, token/deadline checks, group_id). The v1 `Client` above is unchanged. */
export { Client as ClientV2, Errors as ErrorsV2, networks as networksV2 } from "./v2.js";
export { AUTH_VALID_LEDGERS, ClaimSimulationError, buildClaimTxWithAuth, checkClaimAuthEntry, claimArgsToScVals, prepareClaimAuth, sendAndWait, signClaimAuthEntry, } from "./claim-auth.js";
