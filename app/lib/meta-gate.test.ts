import { describe, expect, it } from "vitest";
import { canConfirm, canReserve, parseCreatorAllowlist } from "./meta-gate";

const PAU = "GBLCVZXOJR36M5YC2EX2JU5XDPKA5PVUOJFRMPXPOIRXIQS3NDSB3SP6";
const OTHER = "GBAYZE36B7N2JDHQXTCFB2ZZTGIQBNBLL5O7NACID5HPZLEIJW5KGNYW";
const g = { mainnet: true, creatorAllowlist: [PAU], allowedChestIds: [1] };

describe("meta gate", () => {
  it("testnet is unrestricted", () => {
    const t = { mainnet: false, creatorAllowlist: [], allowedChestIds: null };
    expect(canReserve(t, OTHER)).toBe(true);
    expect(canConfirm(t, OTHER, 99)).toBe(true);
  });
  it("mainnet reserve only for allowlisted creators", () => {
    expect(canReserve(g, PAU)).toBe(true);
    expect(canReserve(g, OTHER)).toBe(false);
    expect(canReserve({ ...g, creatorAllowlist: [] }, PAU)).toBe(false);
  });
  it("mainnet confirm: allowlisted creator or enabled id", () => {
    expect(canConfirm(g, PAU, 7)).toBe(true);
    expect(canConfirm(g, OTHER, 1)).toBe(true);
    expect(canConfirm(g, OTHER, 7)).toBe(false);
  });
  it("parses and filters the env csv", () => {
    expect(parseCreatorAllowlist(` ${PAU}, nope ,${OTHER}`)).toEqual([PAU, OTHER]);
    expect(parseCreatorAllowlist(undefined)).toEqual([]);
  });
});
