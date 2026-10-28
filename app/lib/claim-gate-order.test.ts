import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const gate = vi.fn();
vi.mock("@/lib/relay-gate", () => ({ relayGate: (...a: unknown[]) => gate(...a) }));
vi.mock("@/lib/cfg", () => ({ cfg: async () => ({ IS_MAINNET: false, net: "testnet", NETWORK: { passphrase: "p" }, CONTRACTS: { chest: "" }, REGISTRY_V2: { chest: "" } }) }));
vi.mock("@/lib/rate-limit", () => ({ relayLimit: () => false }));
vi.mock("@/lib/relay-guard", () => ({ relayMaxFee: () => BigInt(1), relayerSecretFor: () => "SECRET" }));

import { POST } from "@/app/api/claim/route";

const hex = (n: number) => "ab".repeat(n);
const valid = {
  chestId: 1,
  recipient: "G" + "A".repeat(55),
  nullifierHex: hex(32),
  proof: { a: hex(64), b: hex(128), c: hex(64) },
};
const req = (body: unknown) =>
  new Request("http://x/api/claim", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;

describe("/api/claim persistent gate order", () => {
  beforeEach(() => gate.mockReset());

  it("junk bodies are rejected before the persistent gate is touched", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ chestId: 1 }))).status).toBe(400);
    expect(gate).not.toHaveBeenCalled();
  });

  it("a valid body reaches the gate, and a denial stops the request", async () => {
    gate.mockResolvedValue({ ok: false, res: NextResponse.json({ code: "rate_limited" }, { status: 429 }) });
    expect((await POST(req(valid))).status).toBe(429);
    expect(gate).toHaveBeenCalledTimes(1);
  });
});
