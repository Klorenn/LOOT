import { describe, expect, it } from "vitest";
import { createdCount, emptyProgress, nextToCreate, runSetCreation, type SetCreateDeps, type SetItem, type SetProgress } from "./chest-set-create";

const items = (n: number): SetItem[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i,
    fingerprintHex: String(i).padStart(64, "0"),
    salt: String(100 + i),
    question: `Q${i + 1}`,
    prizeStroops: BigInt(10_000_000),
  }));

/** Fake chain: chest ids start at 50 and grow; `rejectAt` makes that question's create throw once. */
function harness(opts: { rejectAt?: number; confirmFailsFor?: number[]; reserveFailsAt?: number } = {}) {
  const log: string[] = [];
  let next = 50;
  let rejected = false;
  const confirmFails = new Map<number, number>();
  for (const i of opts.confirmFailsFor ?? []) confirmFails.set(i, 99);
  const progressLog: Array<[number, number | null]> = [];
  const deps: SetCreateDeps = {
    async reserve(item, setId) {
      if (opts.reserveFailsAt === item.index) throw new Error("reserve down");
      log.push(`reserve:${item.index}:${setId ?? "-"}`);
    },
    async create(item) {
      if (opts.rejectAt === item.index && !rejected) {
        rejected = true;
        throw new Error("User declined");
      }
      const chestId = next++;
      log.push(`create:${item.index}:${chestId}`);
      return { chestId, hash: `h${chestId}` };
    },
    async confirm(item, chestId, _hash, setId) {
      const left = confirmFails.get(item.index) ?? 0;
      if (left > 0) {
        confirmFails.set(item.index, left - 1);
        throw new Error("meta down");
      }
      log.push(`confirm:${item.index}:${chestId}:set${setId}`);
    },
    onProgress: (p, w) => progressLog.push([p.members.length, w]),
    confirmAttempts: 2,
  };
  return { deps, log, progressLog };
}

describe("runSetCreation", () => {
  it("creates every question in order and uses question 1's chest id as the set id", async () => {
    const h = harness();
    const r = await runSetCreation(items(3), h.deps);
    expect(r.status).toBe("complete");
    expect(r.progress.setId).toBe(50);
    expect(r.progress.members.map((m) => m.chestId)).toEqual([50, 51, 52]);
    // question 1 is reserved without a set id, the rest carry it
    expect(h.log.filter((l) => l.startsWith("reserve"))).toEqual(["reserve:0:-", "reserve:1:50", "reserve:2:50"]);
    expect(h.log).toContain("confirm:2:52:set50");
  });

  it("reports progress as Creating k/N", async () => {
    const h = harness();
    await runSetCreation(items(3), h.deps);
    expect(h.progressLog.some(([, w]) => w === 2)).toBe(true);
    expect(h.progressLog.at(-1)).toEqual([3, null]);
  });

  it("keeps earlier chests when the user rejects mid-way and reports partial", async () => {
    const h = harness({ rejectAt: 2 });
    const r = await runSetCreation(items(4), h.deps);
    expect(r.status).toBe("partial");
    if (r.status === "complete") throw new Error("unexpected");
    expect(r.failedAt).toBe(2);
    expect(r.stage).toBe("create");
    expect(r.message).toMatch(/declined/);
    expect(createdCount(r.progress)).toBe(2);
    expect(nextToCreate(r.progress, 4)).toBe(2);
    expect(r.progress.members.every((m) => m.saved)).toBe(true);
  });

  it("resumes from the recorded progress without creating anything twice", async () => {
    const h = harness({ rejectAt: 1 });
    const first = await runSetCreation(items(3), h.deps);
    expect(first.status).toBe("partial");
    const second = await runSetCreation(items(3), h.deps, first.progress);
    expect(second.status).toBe("complete");
    const creates = h.log.filter((l) => l.startsWith("create"));
    expect(creates).toEqual(["create:0:50", "create:1:51", "create:2:52"]);
    expect(second.progress.members.map((m) => m.chestId)).toEqual([50, 51, 52]);
  });

  it("fails cleanly (nothing created) when the first question is rejected", async () => {
    const h = harness({ rejectAt: 0 });
    const r = await runSetCreation(items(3), h.deps);
    expect(r.status).toBe("failed");
    expect(createdCount(r.progress)).toBe(0);
    expect(r.progress.setId).toBeUndefined();
  });

  it("stops when question 1 cannot be saved: the chest exists but later ones are not started", async () => {
    const h = harness({ confirmFailsFor: [0] });
    const r = await runSetCreation(items(3), h.deps);
    if (r.status === "complete") throw new Error("unexpected");
    expect(r.stage).toBe("save");
    expect(r.failedAt).toBe(0);
    expect(createdCount(r.progress)).toBe(1);
    expect(r.progress.members[0].saved).toBe(false);
    expect(h.log.some((l) => l.startsWith("create:1"))).toBe(false);
  });

  it("keeps going when a later question can't be saved, and flags it for retry", async () => {
    const h = harness({ confirmFailsFor: [1] });
    const r = await runSetCreation(items(3), h.deps);
    if (r.status === "complete") throw new Error("unexpected");
    expect(r.status).toBe("partial");
    expect(createdCount(r.progress)).toBe(3);
    expect(r.progress.members.map((m) => m.saved)).toEqual([true, false, true]);
    // retry saving only: no new chests
    const h2 = harness();
    const again = await runSetCreation(items(3), h2.deps, r.progress);
    expect(again.status).toBe("complete");
    expect(h2.log.some((l) => l.startsWith("create"))).toBe(false);
    expect(h2.log).toEqual(["confirm:1:51:set50"]);
  });

  it("does not spend anything when the reservation fails", async () => {
    const h = harness({ reserveFailsAt: 0 });
    const r = await runSetCreation(items(2), h.deps, emptyProgress());
    expect(r.status).toBe("failed");
    expect(h.log).toEqual([]);
  });

  it("nextToCreate is null when everything exists", () => {
    const p: SetProgress = { setId: 1, members: [0, 1].map((i) => ({ index: i, chestId: i + 1, saved: true })) };
    expect(nextToCreate(p, 2)).toBeNull();
  });
});
