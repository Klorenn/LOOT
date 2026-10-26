import { describe, expect, it } from "vitest";
import { isChestAllowed } from "./chest-allow";

const PAU = "GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ";
const EVIL = "GBLCVZXOJR36M5YC2EX2JU5XDPKA5PVUOJFRMPXPOIRXIQS3NDSB3SP6";

describe("isChestAllowed", () => {
  it("testnet is unrestricted", () => expect(isChestAllowed({ restricted: false, ids: null, creators: [] }, 5, EVIL)).toBe(true));
  it("mainnet: allowlisted creator OR enabled id", () => {
    const a = { restricted: true, ids: [7], creators: [PAU] };
    expect(isChestAllowed(a, 1, PAU)).toBe(true); // creador aprobado, cualquier id
    expect(isChestAllowed(a, 7, EVIL)).toBe(true); // id habilitado explícitamente
    expect(isChestAllowed(a, 1, EVIL)).toBe(false); // cofre #1 de un desconocido: no
  });
  it("mainnet with nothing configured allows nothing", () => expect(isChestAllowed({ restricted: true, ids: [], creators: [] }, 1, PAU)).toBe(false));
});
