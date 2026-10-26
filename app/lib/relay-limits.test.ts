import { describe, expect, it } from "vitest";
import { decideSponsor } from "./relay-limits";

const X = (n: number) => BigInt(Math.round(n * 1e7));
const base = { mainnet: true, balance: X(50), registrations: 0, deploy: true, max: 60, minBalance: X(3) };

describe("decideSponsor", () => {
  it("sponsors when funded and under the cap", () => expect(decideSponsor(base).ok).toBe(true));
  it("stops below 3 XLM", () => {
    const d = decideSponsor({ ...base, balance: X(2.99) });
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toBe("relayer_low");
  });
  it("fails closed when the balance is unknown", () => expect(decideSponsor({ ...base, balance: null }).ok).toBe(false));
  it("refuses the 61st registration but still relays other txs", () => {
    expect(decideSponsor({ ...base, registrations: 60 }).ok).toBe(false);
    expect(decideSponsor({ ...base, registrations: 59 }).ok).toBe(true);
    expect(decideSponsor({ ...base, registrations: 60, deploy: false }).ok).toBe(true);
  });
  it("is a no-op on testnet", () => expect(decideSponsor({ ...base, mainnet: false, balance: null, registrations: 999 }).ok).toBe(true));
});
