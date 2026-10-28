import { describe, expect, it } from "vitest";
import { buildPoseidon } from "circomlibjs";
import { circuitChestId, refOf } from "./registry";

/** Same construction as lib/zk.ts: nullifier = Poseidon(playerSecret, chestIdInput). */
async function nullifier(secret: bigint, chestIdInput: string): Promise<bigint> {
  const p = await buildPoseidon();
  return p.F.toObject(p([secret, BigInt(chestIdInput)])) as bigint;
}

describe("circuitChestId (public input / nullifier domain)", () => {
  it("v1: the chest id, no group_id needed", () => {
    expect(circuitChestId(6, undefined)).toBe("6");
    expect(circuitChestId(6, null)).toBe("6");
  });

  it("v2 normal chest: group_id (== chest id)", () => {
    expect(circuitChestId(refOf(2, 7), 7)).toBe("7");
  });

  it("v2 set chest: the SET id from group_id, not the chest id", () => {
    // chest 9 lives in set 4: the circuit must get 4
    expect(circuitChestId(refOf(2, 9), 4)).toBe("4");
  });

  it("v2 without group_id read yet: refuses (null) instead of guessing the chest id", () => {
    expect(circuitChestId(refOf(2, 9), undefined)).toBeNull();
    expect(circuitChestId(refOf(2, 9), null)).toBeNull();
  });

  it("two chests of the same set give the same nullifier for one player; another set differs", async () => {
    const secret = BigInt("123456789");
    const a = await nullifier(secret, circuitChestId(refOf(2, 5), 4)!); // chest 5 in set 4
    const b = await nullifier(secret, circuitChestId(refOf(2, 9), 4)!); // chest 9 in set 4
    const other = await nullifier(secret, circuitChestId(refOf(2, 12), 11)!); // chest 12 in set 11
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    // using the chest id instead of group_id would break the shared domain
    expect(await nullifier(secret, "5")).not.toBe(await nullifier(secret, "9"));
  });
});
