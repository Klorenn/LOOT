import { describe, expect, it } from "vitest";
import { isUnfinished, parseDraft, remainingCount, serializeDraft, type SetDraft } from "./set-draft";

const draft = (over: Partial<SetDraft> = {}): SetDraft => ({
  v: 1,
  net: "testnet",
  title: "Trivia",
  listed: false,
  deadline: 1_900_000_000,
  items: [0, 1, 2].map((i) => ({
    index: i,
    fingerprintHex: String(i).padStart(64, "a"),
    salt: String(1000 + i),
    question: `Q${i + 1}`,
    prizeStroops: BigInt(25_000_000),
  })),
  progress: { setId: 9, members: [{ index: 0, chestId: 9, hash: "h", saved: true }] },
  ...over,
});

describe("set draft (partial-failure recovery record)", () => {
  it("round-trips including bigint prizes and progress", () => {
    const back = parseDraft(serializeDraft(draft()));
    expect(back).toEqual(draft());
    expect(back?.items[0].prizeStroops).toBe(BigInt(25_000_000));
  });

  it("never stores answers: the serialized record only has the SetItem fields", () => {
    const raw = serializeDraft(draft());
    expect(Object.keys(JSON.parse(raw).items[0]).sort()).toEqual(["fingerprintHex", "index", "prizeStroops", "question", "salt"]);
  });

  it("treats corrupt or foreign records as no draft", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{")).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 2 }))).toBeNull();
    const bad = JSON.parse(serializeDraft(draft()));
    bad.items[0].fingerprintHex = "zz";
    expect(parseDraft(JSON.stringify(bad))).toBeNull();
  });

  it("knows what is left to create and whether anything is unfinished", () => {
    expect(remainingCount(draft())).toBe(2);
    expect(isUnfinished(draft())).toBe(true);
    const done = draft({ progress: { setId: 9, members: [0, 1, 2].map((i) => ({ index: i, chestId: 9 + i, saved: true })) } });
    expect(remainingCount(done)).toBe(0);
    expect(isUnfinished(done)).toBe(false);
    const unsaved = draft({ progress: { setId: 9, members: [0, 1, 2].map((i) => ({ index: i, chestId: 9 + i, saved: i !== 1 })) } });
    expect(isUnfinished(unsaved)).toBe(true);
  });
});
