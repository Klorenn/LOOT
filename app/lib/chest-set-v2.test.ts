import { describe, expect, it } from "vitest";
import { runSetCreation, type SetCreateDeps, type SetItem } from "./chest-set-create";
import { refOf, resolveSetId, V2_REF_OFFSET } from "./registry";

const items = (n: number): SetItem[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    fingerprintHex: String(i).padStart(64, "0"),
    salt: String(100 + i),
    question: `Q${i + 1}`,
    prizeStroops: BigInt(10_000_000),
  }));

/** Fake v2 chain: create_set returns set 4; chests get ids 5, 6, … (same counter, like the contract). */
function v2Harness(opts: { createSetFails?: boolean } = {}) {
  const log: string[] = [];
  let setCalls = 0;
  let next = 5;
  const deps: SetCreateDeps = {
    async createSet() {
      setCalls++;
      if (opts.createSetFails) throw new Error("User declined");
      log.push("create_set");
      return { setId: refOf(2, 4), hash: "hs" };
    },
    async reserve(item, setId) {
      log.push(`reserve:${item.index}:${setId === undefined ? "-" : setId - V2_REF_OFFSET}`);
    },
    async create(item, setId) {
      const id = next++;
      log.push(`create:${item.index}:in_set${setId === undefined ? "-" : setId - V2_REF_OFFSET}:chest${id}`);
      return { chestId: refOf(2, id), hash: `h${id}` };
    },
    async confirm(item, chestId, _h, setId) {
      log.push(`confirm:${item.index}:set${setId - V2_REF_OFFSET}`);
    },
  };
  return { deps, log, setCalls: () => setCalls };
}

describe("set creation on registry v2 (create_set + create_chest_in_set)", () => {
  it("allocates the set on-chain FIRST; its id comes from the contract, not from question 1's chest", async () => {
    const h = v2Harness();
    const r = await runSetCreation(items(2), h.deps);
    expect(r.status).toBe("complete");
    expect(h.log).toEqual([
      "create_set",
      "reserve:0:4",
      "create:0:in_set4:chest5",
      "confirm:0:set4",
      "reserve:1:4",
      "create:1:in_set4:chest6",
      "confirm:1:set4",
    ]);
    expect(r.progress.setId).toBe(refOf(2, 4)); // not chest 5
  });

  it("a set that already exists (resume) is never created twice", async () => {
    const h = v2Harness();
    const first = await runSetCreation(items(2), h.deps);
    expect(first.status).toBe("complete");
    const again = await runSetCreation(items(2), h.deps, first.progress);
    expect(again.status).toBe("complete");
    expect(h.setCalls()).toBe(1);
  });

  it("if create_set is declined nothing else runs and no chest is created", async () => {
    const h = v2Harness({ createSetFails: true });
    const r = await runSetCreation(items(3), h.deps);
    expect(r.status).toBe("failed");
    expect(h.log).toEqual([]);
    if (r.status !== "complete") expect(r.stage).toBe("create");
  });

  it("registry v1 path (no createSet dep) keeps the old behavior: set id = chest id of question 1", async () => {
    const log: string[] = [];
    let next = 50;
    const deps: SetCreateDeps = {
      async reserve() {},
      async create(_item, setId) {
        log.push(`create:${setId ?? "-"}`);
        return { chestId: next++, hash: "h" };
      },
      async confirm() {},
    };
    const r = await runSetCreation(items(2), deps);
    expect(r.status).toBe("complete");
    expect(r.progress.setId).toBe(50);
    expect(log).toEqual(["create:-", "create:50"]);
  });
});

describe("resolveSetId (server-side membership check)", () => {
  it("v2: the chest's group_id must be the declared on-chain set", () => {
    expect(resolveSetId({ chestRef: refOf(2, 5), groupId: 4, declaredSetId: refOf(2, 4), index: 0 })).toEqual({ setId: refOf(2, 4) });
    expect(resolveSetId({ chestRef: refOf(2, 6), groupId: 4, declaredSetId: refOf(2, 4), index: 1 })).toEqual({ setId: refOf(2, 4) });
  });
  it("v2: a chest from another set, or a normal chest (group_id == id), is refused", () => {
    expect("error" in resolveSetId({ chestRef: refOf(2, 6), groupId: 9, declaredSetId: refOf(2, 4), index: 1 })).toBe(true);
    expect("error" in resolveSetId({ chestRef: refOf(2, 6), groupId: 6, declaredSetId: refOf(2, 6), index: 0 })).toBe(true);
  });
  it("v2: a set that is not an on-chain set id is refused", () => {
    expect("error" in resolveSetId({ chestRef: refOf(2, 5), groupId: 5, declaredSetId: 0, index: 0 })).toBe(true);
    expect("error" in resolveSetId({ chestRef: refOf(2, 5), groupId: 4, declaredSetId: 4, index: 1 })).toBe(true);
  });
  it("v1: unchanged (question 1 is the set, others name it); cannot point at a v2 set", () => {
    expect(resolveSetId({ chestRef: 50, groupId: 50, declaredSetId: 0, index: 0 })).toEqual({ setId: 50 });
    expect(resolveSetId({ chestRef: 51, groupId: 51, declaredSetId: 50, index: 1 })).toEqual({ setId: 50 });
    expect("error" in resolveSetId({ chestRef: 51, groupId: 51, declaredSetId: refOf(2, 4), index: 1 })).toBe(true);
  });
});
