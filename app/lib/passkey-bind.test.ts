import { describe, expect, it } from "vitest";
import { bindPasskeyWallet } from "./passkey-bind";

const C1 = "CCK222I53CTDOAQTYRLK32LDNRKKLBEPDRBBGQWXFJC6YVNEN2OOSJJG";
const C2 = "CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV";

type FakeClient = { options: { contractId: string } };
const makeClient = (contractId: string): FakeClient => ({ options: { contractId } });

describe("bindPasskeyWallet", () => {
  it("binds a disconnected kit (page reload) to the player's wallet without connectWallet", () => {
    const kit: { wallet?: FakeClient; keyId?: string } = {};
    bindPasskeyWallet(kit, C1, "key-1", makeClient);
    expect(kit.wallet?.options.contractId).toBe(C1);
    expect(kit.keyId).toBe("key-1");
  });

  it("keeps an already-connected kit when it points at the same wallet", () => {
    const existing = makeClient(C1);
    const kit: { wallet?: FakeClient; keyId?: string } = { wallet: existing, keyId: "key-1" };
    bindPasskeyWallet(kit, C1, "key-1", makeClient);
    expect(kit.wallet).toBe(existing);
  });

  it("never signs for another wallet: rebinds a kit connected to a different contract", () => {
    const kit: { wallet?: FakeClient; keyId?: string } = { wallet: makeClient(C2), keyId: "other" };
    bindPasskeyWallet(kit, C1, "key-1", makeClient);
    expect(kit.wallet?.options.contractId).toBe(C1);
    expect(kit.keyId).toBe("key-1");
  });

  it("rejects a non-contract address", () => {
    const kit: { wallet?: FakeClient; keyId?: string } = {};
    expect(() => bindPasskeyWallet(kit, "GABC", "key-1", makeClient)).toThrow(/smart wallet/);
  });
});
