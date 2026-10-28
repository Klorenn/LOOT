import { describe, expect, it } from "vitest";
import { contractErrorNumber, safeUpstreamCode, toSafeError } from "./safe-error";

describe("toSafeError", () => {
  it("reduces a contract error to its number", () => {
    const e = new Error("HostError: Error(Contract, #5)\nEvent log: https://rpc.example/secret?key=abc");
    expect(contractErrorNumber(e)).toBe(5);
    const s = toSafeError(e);
    expect(s.code).toBe("contract_5");
    expect(JSON.stringify(s)).not.toMatch(/rpc\.example|secret|Event log/);
  });
  it("maps the registry v2 errors to clear English, still without echoing the raw message", () => {
    const s = toSafeError(new Error("HostError: Error(Contract, #16)\nEvent log: https://rpc.example/secret"));
    expect(s).toEqual({ code: "contract_16", error: "This address already claimed from this chest/set." });
    expect(toSafeError(new Error("Error(Contract, #14)")).error).toMatch(/XLM/);
    expect(toSafeError(new Error("Error(Contract, #15)")).error).toMatch(/90 days/);
    expect(toSafeError(new Error("Error(Contract, #11)")).error).toBe("The contract rejected the request (#11).");
  });
  it("maps network failures to a generic busy code", () => {
    expect(toSafeError(new Error("fetch failed: ECONNRESET https://soroban.internal:8000")).code).toBe("network_busy");
  });
  it("never echoes unknown messages", () => {
    const s = toSafeError(new Error("secret SABC... at /var/task/route.js:12"), "close failed");
    expect(s).toEqual({ code: "internal_error", error: "close failed" });
  });
  it("handles non-Error throws", () => expect(toSafeError("boom").code).toBe("internal_error"));
});

describe("safeUpstreamCode", () => {
  it("keeps tokens, drops free text", () => {
    expect(safeUpstreamCode("INVALID_TX")).toBe("INVALID_TX");
    expect(safeUpstreamCode("bad thing at http://x")).toBeUndefined();
    expect(safeUpstreamCode(42)).toBeUndefined();
  });
});
