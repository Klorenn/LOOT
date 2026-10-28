import { describe, expect, it } from "vitest";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { nextIdFromStorage, scanUpTo } from "./registry-scan";

const entry = (name: string, v: number) =>
  new xdr.ScMapEntry({
    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]),
    val: nativeToScVal(v, { type: "u64" }),
  });

describe("nextIdFromStorage", () => {
  it("finds NextId among other instance keys", () => {
    expect(nextIdFromStorage([entry("Other", 9), entry("NextId", 42)])).toBe(42);
  });
  it("is null when absent or empty", () => {
    expect(nextIdFromStorage([entry("Other", 9)])).toBeNull();
    expect(nextIdFromStorage(undefined)).toBeNull();
  });
});

describe("scanUpTo (registry v2 ids shared with sets)", () => {
  it("finds chests after a long run of set ids (no gap heuristic)", async () => {
    const chests = new Set([1, 40, 41]); // ids 2..39 are sets
    const seen: number[] = [];
    const out = await scanUpTo(42, async (id) => {
      seen.push(id);
      return chests.has(id) ? id : null;
    });
    expect(out).toEqual([1, 40, 41]);
    expect(seen.length).toBe(41); // exactly 1..nextId-1, nothing beyond the counter
  });
  it("reads nothing for a fresh registry and respects the cap", async () => {
    expect(await scanUpTo(1, async () => 1)).toEqual([]);
    expect((await scanUpTo(10_000, async (id) => id, 20)).length).toBe(20);
  });
  it("propagates read errors instead of returning a partial list", async () => {
    await expect(scanUpTo(5, async () => { throw new Error("rpc down"); })).rejects.toThrow("rpc down");
  });
});
