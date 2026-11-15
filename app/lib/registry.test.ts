import { describe, expect, it } from "vitest";
import {
  ALREADY_CLAIMED_MSG,
  MAX_DEADLINE_SECS,
  MAX_TOTAL_FUNDING_XLM,
  V2_BURNED_MAX_ID,
  V2_REF_OFFSET,
  contractErrorCode,
  contractErrorMessage,
  createMethod,
  deadlineError,
  displayId,
  groupIdOf,
  isLegacyV2Ref,
  refOf,
  registryFor,
  splitRef,
  usesCeremonyZkey,
} from "./registry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeChestId, encodeChestId } from "./chest-code";

describe("chest refs", () => {
  it("v1 keeps its plain id (existing links and records stay valid)", () => {
    expect(refOf(1, 6)).toBe(6);
    expect(splitRef(6)).toEqual({ version: 1, id: 6 });
    expect(displayId(6)).toBe(6);
  });
  it("v2 ids live above the offset and never collide with v1", () => {
    expect(refOf(2, 6)).toBe(V2_REF_OFFSET + 6);
    expect(splitRef(V2_REF_OFFSET + 6)).toEqual({ version: 2, id: 6 });
    expect(displayId(V2_REF_OFFSET + 6)).toBe(6);
    expect(refOf(2, 6)).not.toBe(refOf(1, 6));
  });
  it("rejects ids that would blur the two spaces", () => {
    expect(() => refOf(1, V2_REF_OFFSET)).toThrow();
    expect(() => refOf(2, -1)).toThrow();
    expect(() => splitRef(-3)).toThrow();
  });
  it("codes: an existing v1 code decodes to the same id; a v2 code round-trips to a v2 ref", () => {
    const v1 = encodeChestId(6);
    expect(decodeChestId(v1)).toBe(6);
    const v2 = encodeChestId(refOf(2, 6));
    expect(v2).not.toBe(v1);
    expect(decodeChestId(v2)).toBe(refOf(2, 6));
  });
});

describe("registryFor", () => {
  const ids = { chest: "CV1", chestV2: "CV2" };
  it("routes by version", () => {
    expect(registryFor(ids, 7)).toEqual({ version: 1, contractId: "CV1", id: 7 });
    expect(registryFor(ids, refOf(2, 7))).toEqual({ version: 2, contractId: "CV2", id: 7 });
  });
  it("a v2 ref with v2 disabled fails like a missing chest, never reads v1", () => {
    expect(() => registryFor({ chest: "CV1", chestV2: "" }, refOf(2, 7))).toThrow(/ChestNotFound/);
  });
});

describe("group id (circuit chestId input)", () => {
  it("uses group_id when the chest has one (v2, set chests share the set id)", () => {
    expect(groupIdOf({ id: 9, groupId: 4 })).toBe(4);
  });
  it("falls back to the chest id (v1, or v2 normal chest where group_id == id)", () => {
    expect(groupIdOf({ id: 9 })).toBe(9);
    expect(groupIdOf({ id: 9, groupId: null })).toBe(9);
    expect(groupIdOf({ id: 9, groupId: 9 })).toBe(9);
  });
});

describe("zkey selection", () => {
  it("mainnet and every v2 registry use the ceremony zkey; only v1 testnet uses the original", () => {
    expect(usesCeremonyZkey(true, 1)).toBe(true);
    expect(usesCeremonyZkey(true, 2)).toBe(true);
    expect(usesCeremonyZkey(false, 2)).toBe(true);
    expect(usesCeremonyZkey(false, 1)).toBe(false);
  });
});

describe("registry v2 caps", () => {
  it("mirrors the contract: 30 days and 50 XLM per chest", () => {
    expect(MAX_DEADLINE_SECS).toBe(30 * 24 * 3600);
    expect(MAX_TOTAL_FUNDING_XLM).toBe(50);
  });
});

describe("deadlineError", () => {
  const now = 1_800_000_000;
  it("accepts a deadline in the future up to 30 days", () => {
    expect(deadlineError(now + 3600, now)).toBeNull();
    expect(deadlineError(now + MAX_DEADLINE_SECS, now)).toBeNull();
  });
  it("rejects 0, the past and now", () => {
    expect(deadlineError(0, now)).toMatch(/future/);
    expect(deadlineError(now - 1, now)).toMatch(/future/);
    expect(deadlineError(now, now)).toMatch(/future/);
  });
  it("rejects more than 30 days", () => {
    expect(deadlineError(now + MAX_DEADLINE_SECS + 1, now)).toMatch(/30 days/);
  });
  it("rejects non-integers", () => {
    expect(deadlineError(NaN, now)).toMatch(/future/);
  });
});

describe("createMethod (set creation path)", () => {
  it("no set: create_chest on either registry", () => {
    expect(createMethod(1)).toBe("create_chest");
    expect(createMethod(2)).toBe("create_chest");
  });
  it("a v2 set: create_chest_in_set", () => {
    expect(createMethod(2, refOf(2, 4))).toBe("create_chest_in_set");
  });
  it("refuses to mix registries", () => {
    expect(() => createMethod(1, refOf(2, 4))).toThrow(/registry v2/);
    expect(() => createMethod(2, 50)).toThrow(/different registry/);
  });
});

describe("contract error messages", () => {
  it("reads the code from a simulation or relayer error", () => {
    expect(contractErrorCode(new Error("HostError: Error(Contract, #16)\n logs"))).toBe(16);
    expect(contractErrorCode("Error(Contract, #14)")).toBe(14);
    expect(contractErrorCode(new Error("timeout"))).toBeNull();
  });
  it("maps the v2 errors to clear English", () => {
    expect(contractErrorMessage(16)).toBe("This address already claimed from this chest/set.");
    expect(contractErrorMessage(16)).toBe(ALREADY_CLAIMED_MSG);
    expect(contractErrorMessage(14)).toMatch(/XLM/);
    expect(contractErrorMessage(15)).toMatch(/30 days/);
    expect(contractErrorMessage(17)).toMatch(/50 XLM/);
    expect(contractErrorMessage(12)).toMatch(/owner of this set/);
    expect(contractErrorMessage(13)).toMatch(/set doesn’t exist/);
  });
  it("unknown or retired codes (10, 11) have no message", () => {
    expect(contractErrorMessage(10)).toBeNull();
    expect(contractErrorMessage(11)).toBeNull();
    expect(contractErrorMessage(null)).toBeNull();
  });
});

describe("legacy refs (ids burned in the current testnet v2 registry)", () => {
  it("V2_BURNED_MAX_ID mirrors deployments/registry-v2-testnet.json", () => {
    const rec = JSON.parse(readFileSync(resolve(__dirname, "../../deployments/registry-v2-testnet.json"), "utf8"));
    expect(rec.burnedIdRange).toEqual({ from: 1, to: V2_BURNED_MAX_ID });
  });
  it("v2 refs inside the burned range are legacy (they belonged to the previous registry)", () => {
    expect(isLegacyV2Ref(V2_REF_OFFSET + 1)).toBe(true);
    expect(isLegacyV2Ref(V2_REF_OFFSET + 38)).toBe(true);
    expect(isLegacyV2Ref(V2_REF_OFFSET + V2_BURNED_MAX_ID)).toBe(true);
  });
  it("the first real chest and v1 refs are not legacy", () => {
    expect(isLegacyV2Ref(V2_REF_OFFSET + V2_BURNED_MAX_ID + 1)).toBe(false);
    expect(isLegacyV2Ref(7)).toBe(false);
  });
});
