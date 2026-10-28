import { describe, expect, it } from "vitest";
import { configFor, mainnetPublicFromEnv, type MainnetPublic } from "./network";

const REG = "CBKH5Z25DDQRGMJDXQWUADOND4DUM5CN4CVZOX7M3OFH2HL7KYFONRRV";
const VER = "CCUF6M5Y6B6VR5HB72M7VFBHLC7ILBBKAGF6TI76PZ5YUOI6Q72HXTIE";
const ready: MainnetPublic = { registry: REG, verifier: VER, rpcUrl: "https://rpc.example", horizonUrl: "", maxPrizePerPlaceXlm: 1, maxTotalPrizeXlm: 30, sampleChestId: 1, listedIds: [7], creatorAllowlist: [], passkeyEnabled: false };

const V2 = "CAEBFT22DIJNNJ6CLHY5L3SKLSACRHJLJW22VQAKTI3MCCP5KTO277NJ";
const V2VER = "CCFHJHU2DSVEYXRH7JE457654JB7N2RKDG5A5HJCKT42PZS3ZMMIZPTV";
const TESTNET_V1 = "CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ";

function withEnv(env: Record<string, string>, fn: () => void) {
  const keys = ["NEXT_PUBLIC_REGISTRY_V2_ID", "NEXT_PUBLIC_VERIFIER_V2_ID", "NEXT_PUBLIC_REGISTRY_VERSION", "MAINNET_REGISTRY_V2_ID", "MAINNET_VERIFIER_V2_ID", "MAINNET_REGISTRY_VERSION"];
  const old = keys.map((k) => process.env[k]);
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    fn();
  } finally {
    keys.forEach((k, i) => {
      if (old[i] === undefined) delete process.env[k];
      else process.env[k] = old[i];
    });
  }
}

describe("registry v2 config (off by default)", () => {
  it("no env: v2 absent and new chests go to v1 (production behavior unchanged)", () => {
    withEnv({}, () => {
      const t = configFor("testnet", ready);
      expect(t.REGISTRY_V2.chest).toBe("");
      expect(t.CREATE_VERSION).toBe(1);
      const m = configFor("mainnet", ready);
      expect(m.REGISTRY_V2.chest).toBe("");
      expect(m.CREATE_VERSION).toBe(1);
    });
  });

  it("testnet: a v2 id alone makes v2 readable but new chests stay in v1", () => {
    withEnv({ NEXT_PUBLIC_REGISTRY_V2_ID: V2 }, () => {
      const t = configFor("testnet", ready);
      expect(t.REGISTRY_V2.chest).toBe(V2);
      expect(t.CREATE_VERSION).toBe(1);
      expect(t.CONTRACTS.chest).toBe(TESTNET_V1); // v1 untouched
    });
  });

  it("testnet: REGISTRY_VERSION=2 with a valid v2 id sends new chests to v2", () => {
    withEnv({ NEXT_PUBLIC_REGISTRY_V2_ID: V2, NEXT_PUBLIC_VERIFIER_V2_ID: V2VER, NEXT_PUBLIC_REGISTRY_VERSION: "2" }, () => {
      const t = configFor("testnet", ready);
      expect(t.CREATE_VERSION).toBe(2);
      expect(t.REGISTRY_V2).toEqual({ chest: V2, verifier: V2VER });
    });
  });

  it("REGISTRY_VERSION=2 without a valid v2 id falls back to v1", () => {
    withEnv({ NEXT_PUBLIC_REGISTRY_VERSION: "2" }, () => expect(configFor("testnet", ready).CREATE_VERSION).toBe(1));
    withEnv({ NEXT_PUBLIC_REGISTRY_VERSION: "2", NEXT_PUBLIC_REGISTRY_V2_ID: "C..." }, () => expect(configFor("testnet", ready).CREATE_VERSION).toBe(1));
  });

  it("mainnet ignores v2 entirely, even with every v2 env var set (testnet-only release)", () => {
    withEnv(
      { MAINNET_REGISTRY_V2_ID: V2, MAINNET_VERIFIER_V2_ID: V2VER, MAINNET_REGISTRY_VERSION: "2", NEXT_PUBLIC_REGISTRY_V2_ID: V2, NEXT_PUBLIC_REGISTRY_VERSION: "2" },
      () => {
        const m = configFor("mainnet", mainnetPublicFromEnv());
        expect(m.REGISTRY_V2).toEqual({ chest: "", verifier: "" });
        expect(m.CREATE_VERSION).toBe(1);
        expect(configFor("mainnet", ready).REGISTRY_V2.chest).toBe("");
      },
    );
  });
});
