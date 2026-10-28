import { beforeEach, describe, expect, it, vi } from "vitest";

const conf = { IS_MAINNET: false, CREATE_VERSION: 2 as 1 | 2, ALLOWED_CHEST_IDS: null, CAPS: {} };
vi.mock("@/lib/cfg", () => ({ cfg: async () => conf }));
const reserve = vi.fn(async () => "ok");
vi.mock("@/lib/chest-store", () => ({
  StorageNotConfiguredError: class extends Error {},
  reserveChestMeta: (...a: unknown[]) => reserve(...(a as [])),
  getPending: async () => null,
  getSetHeader: async () => null,
  getSetMember: async () => null,
  getSetMembers: async () => new Map(),
  deleteSetMember: async () => undefined,
  saveChestMeta: async (m: unknown) => m,
  saveSetHeader: async () => "ok",
  saveSetMember: async () => "ok",
}));

import { POST } from "@/app/api/chests/meta/route";

let n = 0;
const body = (over: Record<string, unknown> = {}) => ({
  action: "reserve",
  creator: "GAKD2FSFFNLBVTUB4JHFYVUUMTKKEEJO2TG77BHV2KCZTDPUB64JU7E2",
  fingerprintHex: (++n).toString(16).padStart(64, "0"),
  question: "q",
  prize: 1,
  maxClaims: 1,
  listed: true,
  salt: "7",
  ...over,
});
const post = (b: unknown) =>
  POST(
    new Request("http://x/api/chests/meta", {
      method: "POST",
      headers: { "x-forwarded-for": `10.0.0.${n}` },
      body: JSON.stringify(b),
    }) as never,
  );
const set = { index: 0, size: 2, title: "t" };

describe("/api/chests/meta reserve: sets and kdf need registry v2 (testnet)", () => {
  beforeEach(() => {
    reserve.mockClear();
    conf.IS_MAINNET = false;
    conf.CREATE_VERSION = 2;
  });

  it("v2: a set reservation and the argon2id kdf tag are accepted", async () => {
    expect((await post(body({ set, kdf: "argon2id-v1" }))).status).toBe(200);
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ kdf: "argon2id-v1", set: expect.anything() }));
  });

  it("v1: set reservations are refused", async () => {
    conf.CREATE_VERSION = 1;
    const r = await post(body({ set }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/registry v2/);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("v1 and mainnet: the kdf tag is refused; unknown tags are refused", async () => {
    conf.CREATE_VERSION = 1;
    expect((await post(body({ kdf: "argon2id-v1" }))).status).toBe(400);
    conf.CREATE_VERSION = 2;
    expect((await post(body({ kdf: "argon2id-v9" }))).status).toBe(400);
    conf.IS_MAINNET = true;
    expect((await post(body({ kdf: "argon2id-v1" }))).status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("a plain chest without kdf is unchanged", async () => {
    conf.CREATE_VERSION = 1;
    expect((await post(body())).status).toBe(200);
    expect(reserve).toHaveBeenCalledWith(expect.not.objectContaining({ kdf: expect.anything() }));
  });
});
