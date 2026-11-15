import { beforeEach, describe, expect, it, vi } from "vitest";

const readAllChests = vi.fn();
const readChest = vi.fn();
const listChests = vi.fn();
vi.mock("@/lib/mainnet-guard", () => ({ legacyOff: async () => null }));
vi.mock("@/lib/listing", () => ({ readAllChests: (...a: unknown[]) => readAllChests(...a) }));
vi.mock("@/lib/chain", () => ({ readChest: (...a: unknown[]) => readChest(...a) }));
vi.mock("@/lib/chest-store", () => ({ listChests: () => listChests() }));

import { GET } from "@/app/api/chests/route";

const V2 = 1_000_000_000;
const onChain = (id: number, over = {}) => ({
  id,
  version: id >= V2 ? 2 : 1,
  groupId: id,
  creator: "GCREATOR",
  token: "T",
  prize: BigInt(1),
  maxClaims: 3,
  claims: 1,
  deadline: Math.floor(Date.now() / 1000) + 1000,
  closed: false,
  fingerprintHex: "",
  ...over,
});
const stored = (id: number) => ({ id, template: "bounty", question: "q", hint: "", prize: 1, maxClaims: 3, createdAt: "x", salt: "s" });

describe("GET /api/chests (panel list)", () => {
  beforeEach(() => {
    readAllChests.mockReset();
    readChest.mockReset();
    listChests.mockReset().mockResolvedValue([stored(V2 + 51), stored(V2 + 52), stored(V2 + 7)]);
    readAllChests.mockResolvedValue([onChain(V2 + 51), onChain(V2 + 7)]); // V2 + 7 is a burned slot
  });

  it("reads the chain through the shared cached scan, never one RPC read per stored chest", async () => {
    await GET();
    await GET();
    expect(readChest).not.toHaveBeenCalled();
    expect(readAllChests).toHaveBeenCalledTimes(2); // cached inside readAllChests (30 s TTL), not fresh
    expect(readAllChests.mock.calls.every((c) => c[0] === undefined || c[0] === false)).toBe(true);
  });

  it("maps scan results to panel state: found, not created, legacy; the salt is not exposed", async () => {
    const { chests } = await (await GET()).json();
    const by = (id: number) => chests.find((c: { id: number }) => c.id === id);
    expect(by(V2 + 51)).toMatchObject({ onchain: true, state: { status: "open" } });
    expect(by(V2 + 52)).toMatchObject({ onchain: false, state: { status: "not_created" } });
    expect(by(V2 + 7)).toMatchObject({ chain: null, state: { status: "legacy", canClose: false } });
    expect(JSON.stringify(chests)).not.toContain('"salt"');
  });

  it("when the scan fails the state is unavailable (null), not 'not created'", async () => {
    readAllChests.mockRejectedValue(new Error("rpc down"));
    const { chests } = await (await GET()).json();
    const c = chests.find((x: { id: number }) => x.id === V2 + 51);
    expect(c).toMatchObject({ onchain: null, state: null, chain: null });
  });
});
