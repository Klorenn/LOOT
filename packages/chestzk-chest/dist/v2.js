import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
if (typeof window !== "undefined") {
    //@ts-ignore Buffer exists
    window.Buffer = window.Buffer || Buffer;
}
export const networks = {
    testnet: {
        networkPassphrase: "Test SDF Network ; September 2015",
        contractId: "CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG",
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
    12: { message: "NotSetOwner" },
    13: { message: "SetNotFound" },
    /**
     * create_chest / create_chest_in_set received a token other than the one fixed in the constructor.
     */
    14: { message: "WrongToken" },
    /**
     * Deadline must satisfy now < deadline <= now + MAX_DEADLINE.
     */
    15: { message: "BadDeadline" },
    /**
     * This recipient already claimed in this group (chest or set). Does NOT stop fresh addresses.
     */
    16: { message: "AlreadyClaimed" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { verifier, token }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ verifier, token }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAQAAAAAAAAAAAAAABUNoZXN0AAAAAAAACQAAAAAAAAAGY2xhaW1zAAAAAAAEAAAAAAAAAAZjbG9zZWQAAAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAIhJZCBwdXNoZWQgdG8gdGhlIGNpcmN1aXQgYXMgdGhlIGBjaGVzdElkYCBwdWJsaWMgaW5wdXQuIEZvciBhIG5vcm1hbApjaGVzdCBpdCBlcXVhbHMgdGhlIGNoZXN0IGlkOyBmb3IgY2hlc3RzIGluIGEgc2V0IGl0IGlzIHRoZSBzZXQgaWQuAAAACGdyb3VwX2lkAAAABgAAAAAAAAAKbWF4X2NsYWltcwAAAAAABAAAAAAAAAAFcHJpemUAAAAAAAALAAAAAAAAAAV0b2tlbgAAAAAAABM=",
            "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADgAAAAAAAAANQ2hlc3ROb3RGb3VuZAAAAAAAAAEAAAAAAAAAC0NoZXN0Q2xvc2VkAAAAAAIAAAAAAAAADENoZXN0RXhwaXJlZAAAAAMAAAAAAAAAB1NvbGRPdXQAAAAABAAAAAAAAAANTnVsbGlmaWVyVXNlZAAAAAAAAAUAAAAAAAAADEludmFsaWRQcm9vZgAAAAYAAAAAAAAACk5vdENyZWF0b3IAAAAAAAcAAAAAAAAAC1N0aWxsQWN0aXZlAAAAAAgAAAAAAAAACkJhZEFtb3VudHMAAAAAAAkAAAAAAAAAC05vdFNldE93bmVyAAAAAAwAAAAAAAAAC1NldE5vdEZvdW5kAAAAAA0AAABgY3JlYXRlX2NoZXN0IC8gY3JlYXRlX2NoZXN0X2luX3NldCByZWNlaXZlZCBhIHRva2VuIG90aGVyIHRoYW4gdGhlIG9uZSBmaXhlZCBpbiB0aGUgY29uc3RydWN0b3IuAAAACldyb25nVG9rZW4AAAAAAA4AAAA7RGVhZGxpbmUgbXVzdCBzYXRpc2Z5IG5vdyA8IGRlYWRsaW5lIDw9IG5vdyArIE1BWF9ERUFETElORS4AAAAAC0JhZERlYWRsaW5lAAAAAA8AAABbVGhpcyByZWNpcGllbnQgYWxyZWFkeSBjbGFpbWVkIGluIHRoaXMgZ3JvdXAgKGNoZXN0IG9yIHNldCkuIERvZXMgTk9UIHN0b3AgZnJlc2ggYWRkcmVzc2VzLgAAAAAOQWxyZWFkeUNsYWltZWQAAAAAABA=",
            "AAAAAQAAAHJXaXJlLWNvbXBhdGlibGUgY29uIGVsIGBQcm9vZmAgZGVsIHZlcmlmaWNhZG9yIGdlbmVyYWRvCihhOiBHMSA2NEIsIGI6IEcyIDEyOEIsIGM6IEcxIDY0QiwgZXRoZXJldW0tdW5jb21wcmVzc2VkKS4AAAAAAAAAAAAFUHJvb2YAAAAAAAADAAAAAAAAAAFhAAAAAAAD7gAAAEAAAAAAAAAAAWIAAAAAAAPuAAAAgAAAAAAAAAABYwAAAAAAA+4AAABA",
            "AAAAAgAAAExUaGlzIGNvbnRyYWN0IGlzIGltbXV0YWJsZSAobm8gdXBncmFkZSBwYXRoKTogY2hhbmdlcyBtZWFuIGEgbmV3IGRlcGxveW1lbnQuAAAAAAAAAAdEYXRhS2V5AAAAAAcAAAAAAAAAAAAAAAhWZXJpZmllcgAAAAAAAABLVGhlIHNpbmdsZSB0b2tlbiAoWExNIFNBQykgdGhpcyByZWdpc3RyeSBhY2NlcHRzLCBmaXhlZCBpbiB0aGUgY29uc3RydWN0b3IuAAAAAAVUb2tlbgAAAAAAAAAAAAAAAAAABk5leHRJZAAAAAAAAQAAAAAAAAAFQ2hlc3QAAAAAAAABAAAABgAAAAEAAAAAAAAACU51bGxpZmllcgAAAAAAAAEAAAPuAAAAIAAAAAEAAADpKGdyb3VwIGlkLCByZWNpcGllbnQpIC0+IHRydWUuIE9uZSBjbGFpbSBwZXIgYWRkcmVzcyBwZXIgZ3JvdXAuIFRoaXMgaXMgTk9UIHN5YmlsCnJlc2lzdGFuY2U6IGEgcGVyc29uIHdpdGggTiBmcmVzaCBhZGRyZXNzZXMgKGFuZCBOIHBsYXllciBzZWNyZXRzKSBzdGlsbCBjbGFpbXMgTiB0aW1lcy4KSXQgb25seSBzdG9wcyB0aGUgU0FNRSBhZGRyZXNzIGZyb20gY2xhaW1pbmcgdHdpY2UgaW4gYSBncm91cC4AAAAAAAAHQ2xhaW1lZAAAAAACAAAABgAAABMAAAABAAAAQ3NldCBpZCAtPiBjcmVhdG9yLiBTZXQgaWRzIGNvbWUgZnJvbSB0aGUgc2FtZSBjb3VudGVyIGFzIGNoZXN0IGlkcy4AAAAACFNldE93bmVyAAAAAQAAAAY=",
            "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAEAAAAAAAAAAhjaGVzdF9pZAAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAABAAAD6QAAAAIAAAAD",
            "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
            "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
            "AAAAAAAAAAAAAAAIdmVyaWZpZXIAAAAAAAAAAQAAABM=",
            "AAAAAAAAAAAAAAAJZ2V0X2NoZXN0AAAAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAfQAAAABUNoZXN0AAAAAAAAAw==",
            "AAAAAAAAAI5BbGxvY2F0ZSBhIHNldCBpZCAoZnJvbSB0aGUgc2FtZSBjb3VudGVyIGFzIGNoZXN0IGlkcywgc28gaXQgY2FuIG5ldmVyCmVxdWFsIGFueSBjaGVzdCBpZCBvciBhbnkgb3RoZXIgc2V0IGlkKS4gT25seSBgY3JlYXRvcmAgY2FuIGFkZCBjaGVzdHMuAAAAAAAKY3JlYXRlX3NldAAAAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAQAAA+kAAAAGAAAAAw==",
            "AAAAAAAAAAAAAAALY2xvc2VfY2hlc3QAAAAAAQAAAAAAAAAIY2hlc3RfaWQAAAAGAAAAAQAAA+kAAAALAAAAAw==",
            "AAAAAAAAAAAAAAAMY3JlYXRlX2NoZXN0AAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAtmaW5nZXJwcmludAAAAAPuAAAAIAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAVwcml6ZQAAAAAAAAsAAAAAAAAACm1heF9jbGFpbXMAAAAAAAQAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAPpAAAABgAAAAM=",
            "AAAAAAAAAKhEZXBsb3ktdGltZSBpbml0aWFsaXNhdGlvbiAoYXRvbWljIHdpdGggZGVwbG95bWVudDogbm8gaW5pdCBmcm9udC1ydW4gd2luZG93KS4KYHZlcmlmaWVyYDogR3JvdGgxNiB2ZXJpZmllciBjb250cmFjdC4gYHRva2VuYDogdGhlIG9ubHkgdG9rZW4gY2hlc3RzIG1heSBob2xkIChYTE0gU0FDKS4AAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
            "AAAAAAAAAIJDcmVhdGUgYSBjaGVzdCBpbnNpZGUgYSBzZXQgbWFkZSB3aXRoIGBjcmVhdGVfc2V0YC4gQWxsIGNoZXN0cyBvZiBhIHNldApzaGFyZSB0aGUgbnVsbGlmaWVyIGRvbWFpbjogb25lIGNsYWltIHBlciBhY2NvdW50IHBlciBzZXQuAAAAAAATY3JlYXRlX2NoZXN0X2luX3NldAAAAAAHAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAABnNldF9pZAAAAAAABgAAAAAAAAALZmluZ2VycHJpbnQAAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFcHJpemUAAAAAAAALAAAAAAAAAAptYXhfY2xhaW1zAAAAAAAEAAAAAAAAAAhkZWFkbGluZQAAAAYAAAABAAAD6QAAAAYAAAAD"]), options);
        this.options = options;
    }
    fromJSON = {
        claim: (this.txFromJSON),
        token: (this.txFromJSON),
        version: (this.txFromJSON),
        verifier: (this.txFromJSON),
        get_chest: (this.txFromJSON),
        create_set: (this.txFromJSON),
        close_chest: (this.txFromJSON),
        create_chest: (this.txFromJSON),
        create_chest_in_set: (this.txFromJSON)
    };
}
