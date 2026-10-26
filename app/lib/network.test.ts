import { describe, expect, it } from "vitest";
import { configFor, effectiveNet, readNetCookie, type MainnetPublic } from "./network";

const REG = "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV";
const VER = "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE";
const ready: MainnetPublic = { registry: REG, verifier: VER, rpcUrl: "https://rpc.example", horizonUrl: "", maxPrizePerPlaceXlm: 1, maxTotalPrizeXlm: 30, sampleChestId: 1, listedIds: [7] };
const empty: MainnetPublic = { ...ready, registry: "", verifier: "", rpcUrl: "" };

describe("configFor", () => {
  it("mainnet: public passphrase, SAC, explorer, no friendbot, env ids", () => {
    const c = configFor("mainnet", ready);
    expect(c.NETWORK.passphrase).toBe("Public Global Stellar Network ; September 2015");
    expect(c.XLM_SAC).toBe("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA");
    expect(c.NETWORK.friendbotUrl).toBeNull();
    expect(c.NETWORK.explorerUrl).toBe("https://stellar.expert/explorer/public");
    expect(c.NETWORK.rpcUrls).toEqual(["https://rpc.example", "https://mainnet.sorobanrpc.com"]);
    expect(c.CONTRACTS).toEqual({ chest: REG, verifier: VER, token: c.XLM_SAC });
    expect(c.CAPS).toEqual({ maxPrizePerPlaceXlm: 1, maxTotalPrizeXlm: 30 });
    expect(c.DEMO_CHEST_ID).toBe(0);
    expect(c.ALLOWED_CHEST_IDS).toEqual([1, 7]);
    expect(c.LISTED_CHEST_IDS).toEqual([1, 7]);
    expect(c.mainnetReady).toBe(true);
  });
  it("testnet: unchanged ids, friendbot, no caps, demo chest", () => {
    const c = configFor("testnet", ready);
    expect(c.NETWORK.passphrase).toBe("Test SDF Network ; September 2015");
    expect(c.CONTRACTS.chest).toBe("CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ");
    expect(c.NETWORK.friendbotUrl).toBe("https://friendbot.stellar.org");
    expect(c.CAPS.maxTotalPrizeXlm).toBe(Infinity);
    expect(c.LISTED_CHEST_IDS).toEqual([6]);
    expect(c.ALLOWED_CHEST_IDS).toBeNull();
    expect(c.CONFIG_INCOMPLETE).toBe(false);
  });
  it("incomplete mainnet env is flagged and ids stay empty (never a testnet id)", () => {
    const c = configFor("mainnet", empty);
    expect(c.mainnetReady).toBe(false);
    expect(c.CONFIG_ISSUES).toEqual(["MAINNET_RPC_URL", "MAINNET_REGISTRY_ID", "MAINNET_VERIFIER_ID"]);
    expect(c.CONTRACTS.chest).toBe("");
    expect(configFor("testnet", empty).mainnetReady).toBe(false);
  });
  it("placeholder ids are not valid", () => {
    expect(configFor("mainnet", { ...ready, registry: "C..." }).CONFIG_ISSUES).toContain("MAINNET_REGISTRY_ID");
  });
});

describe("cookie and effective network", () => {
  it("parses loot_net from a cookie header", () => {
    expect(readNetCookie("a=1; loot_net=mainnet; b=2")).toBe("mainnet");
    expect(readNetCookie("loot_net=testnet")).toBe("testnet");
    expect(readNetCookie("loot_net=evil")).toBeNull();
    expect(readNetCookie(undefined)).toBeNull();
  });
  it("defaults to testnet and only honours mainnet when configured", () => {
    expect(effectiveNet(null, ready)).toBe("testnet");
    expect(effectiveNet("mainnet", ready)).toBe("mainnet");
    expect(effectiveNet("mainnet", empty)).toBe("testnet");
    expect(effectiveNet("testnet", ready)).toBe("testnet");
  });
});
