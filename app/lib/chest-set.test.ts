import { describe, expect, it } from "vitest";
import {
  chestSaltFragment,
  decideSetClaim,
  groupSetRows,
  maxSetSize,
  parseSetSalts,
  setCapError,
  setSaltsFragment,
  validateSetShape,
  type SetRow,
} from "./chest-set";

const X = (n: number) => BigInt(n) * BigInt(10_000_000);
const mainnetCaps = { maxPrizePerPlaceXlm: 5, maxTotalPrizeXlm: 20 };
const noCaps = { maxPrizePerPlaceXlm: Infinity, maxTotalPrizeXlm: Infinity };

describe("setCapError", () => {
  it("passes when every prize and the total are within the caps", () => {
    expect(setCapError([X(5), X(5), X(5), X(5)], mainnetCaps)).toBeNull();
  });
  it("rejects one prize above the per-place cap", () => {
    expect(setCapError([X(1), X(6)], mainnetCaps)).toMatch(/at most 5 XLM per question/);
  });
  it("rejects a total across the set above the total cap even if each prize is fine", () => {
    const err = setCapError([X(5), X(5), X(5), X(5), X(1)], mainnetCaps);
    expect(err).toMatch(/at most 20 XLM in total per set/);
    expect(err).toMatch(/21/);
  });
  it("has no limits on testnet", () => {
    expect(setCapError([X(1000), X(1000)], noCaps)).toBeNull();
  });
});

describe("set size", () => {
  it("passkey on mainnet is capped lower than wallets", () => {
    expect(maxSetSize("passkey", true)).toBe(5);
    expect(maxSetSize("wallet", true)).toBe(10);
    expect(maxSetSize("passkey", false)).toBe(10);
  });
  it("validates min and max", () => {
    expect(validateSetShape(1, "wallet", false)).toMatch(/at least 2/);
    expect(validateSetShape(11, "wallet", false)).toMatch(/at most 10/);
    expect(validateSetShape(6, "passkey", true)).toMatch(/at most 5/);
    expect(validateSetShape(5, "passkey", true)).toBeNull();
  });
});

describe("private set salts in the link fragment", () => {
  it("round-trips and maps to the member chest fragment", () => {
    const frag = setSaltsFragment(["11", "22", "33"]);
    expect(frag).toBe("#s=11.22.33");
    const salts = parseSetSalts(frag);
    expect(salts).toEqual(["11", "22", "33"]);
    expect(chestSaltFragment(salts, 1)).toBe("#s=22");
  });
  it("ignores junk and missing fragments", () => {
    expect(parseSetSalts("")).toEqual([]);
    expect(parseSetSalts("#s=1.x.3")).toEqual(["1", undefined, "3"]);
    expect(chestSaltFragment([], 0)).toBe("");
  });
});

describe("one Loot per account per set (off-chain)", () => {
  it("reserves when the account has no marker", () => {
    expect(decideSetClaim(null, 7)).toBe("reserve");
  });
  it("allows a retry of the same chest", () => {
    expect(decideSetClaim({ chestId: 7 }, 7)).toBe("same-chest");
  });
  it("refuses a different chest of the same set", () => {
    expect(decideSetClaim({ chestId: 7 }, 8)).toBe("refuse");
  });
});

const row = (id: number, status: SetRow["status"], set?: SetRow["set"], extra: Partial<SetRow> = {}): SetRow => ({
  id,
  status,
  prizeStroops: String(X(2)),
  token: "TOK",
  question: `q${id}`,
  set,
  ...extra,
});

describe("groupSetRows", () => {
  const s = (index: number) => ({ id: 10, index, size: 3, title: "Trivia" });
  it("collapses set members into one card and keeps ordinary chests", () => {
    const rows = [row(12, "open", s(2)), row(3, "open"), row(10, "claimed", s(0)), row(11, "open", s(1))];
    const items = groupSetRows(rows);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "set", setId: 10, title: "Trivia", size: 3, openCount: 2, status: "open" });
    expect(items[0].kind === "set" && items[0].rows.map((r) => r.id)).toEqual([10, 11, 12]);
    expect(items[0].kind === "set" && items[0].totalStroops).toBe(String(X(6)));
    expect(items[1]).toMatchObject({ kind: "chest" });
  });
  it("is claimed only when every member is claimed, expired when none open and some expired", () => {
    expect(groupSetRows([row(10, "claimed", s(0)), row(11, "claimed", s(1))])[0]).toMatchObject({ status: "claimed", openCount: 0 });
    expect(groupSetRows([row(10, "claimed", s(0)), row(11, "expired", s(1))])[0]).toMatchObject({ status: "expired" });
  });
  it("does not sum prizes of different tokens", () => {
    const items = groupSetRows([row(10, "open", s(0)), row(11, "open", s(1), { token: "OTHER" })]);
    expect(items[0].kind === "set" && items[0].totalStroops).toBeNull();
  });
  it("keeps two different sets apart", () => {
    const items = groupSetRows([row(1, "open", { id: 1, index: 0, size: 2, title: "A" }), row(5, "open", { id: 5, index: 0, size: 2, title: "B" })]);
    expect(items.map((i) => i.kind === "set" && i.setId)).toEqual([1, 5]);
  });
});
