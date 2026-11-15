import { describe, expect, it } from "vitest";
import { closePreflight, closePreflightForRef, panelState, panelStateForRef } from "./chest-panel-state";

const NOW = 1_800_000_000;
const base = { closed: false, claims: 1, maxClaims: 3, deadline: NOW + 1000, creator: "GCREATOR" };

describe("panelState", () => {
  it("open chest cannot be closed yet and says when it can", () => {
    const s = panelState(base, NOW);
    expect(s.status).toBe("open");
    expect(s.canClose).toBe(false);
    expect(s.note).toMatch(/after the deadline .* or once all places are claimed/i);
    expect(s.note).toContain(new Date((NOW + 1000) * 1000).toISOString().slice(0, 10));
  });
  it("expired chest can be closed (contract: now > deadline)", () => {
    expect(panelState({ ...base, deadline: NOW - 1 }, NOW)).toMatchObject({ status: "expired", canClose: true });
    expect(panelState({ ...base, deadline: NOW }, NOW)).toMatchObject({ status: "open", canClose: false });
  });
  it("sold out chest can be closed even before the deadline", () => {
    expect(panelState({ ...base, claims: 3 }, NOW)).toMatchObject({ status: "sold_out", canClose: true });
  });
  it("closed chest cannot be closed again", () => {
    const s = panelState({ ...base, closed: true, claims: 3 }, NOW);
    expect(s).toMatchObject({ status: "closed", canClose: false });
    expect(s.note).toMatch(/already closed/i);
  });
  it("no chain state means not created", () => {
    expect(panelState(null, NOW)).toMatchObject({ status: "not_created", canClose: false });
  });
});

describe("v1 deadline = 0 (never expires)", () => {
  const forever = { ...base, deadline: 0 };
  it("never becomes expired: stays open however late it is", () => {
    expect(panelState(forever, NOW)).toMatchObject({ status: "open", canClose: false });
    expect(panelState(forever, NOW * 10)).toMatchObject({ status: "open", canClose: false });
    expect(panelState(forever, NOW).note).not.toMatch(/\(\d{4}-/);
  });
  it("can still be closed once sold out", () => {
    expect(panelState({ ...forever, claims: 3 }, NOW)).toMatchObject({ status: "sold_out", canClose: true });
  });
  it("closePreflight refuses with still_active, and lets the creator close it once sold out", () => {
    expect(closePreflight(forever, "GCREATOR", NOW * 10)).toMatchObject({ ok: false, status: 409, code: "still_active" });
    expect(closePreflight({ ...forever, claims: 3 }, "GCREATOR", NOW)).toEqual({ ok: true });
  });
});

describe("legacy refs (previous testnet registry)", () => {
  const LEGACY = 1_000_000_007;
  const REAL = 1_000_000_051;
  it("legacy refs show as legacy, not 'not created', even though the new registry has nothing there", () => {
    expect(panelStateForRef(LEGACY, null, NOW)).toMatchObject({ status: "legacy", canClose: false });
    expect(panelStateForRef(LEGACY, null, NOW).note).toMatch(/previous testnet registry/i);
  });
  it("legacy wins over whatever the new registry holds at that id (burned set)", () => {
    expect(panelStateForRef(LEGACY, { ...base, deadline: NOW - 1 }, NOW)).toMatchObject({ status: "legacy", canClose: false });
  });
  it("non-legacy refs behave as before", () => {
    expect(panelStateForRef(REAL, null, NOW)).toMatchObject({ status: "not_created" });
    expect(panelStateForRef(7, base, NOW)).toMatchObject({ status: "open" });
  });
  it("closePreflightForRef: 409 legacy_registry, never reaches the new registry", () => {
    expect(closePreflightForRef(LEGACY, { ...base, deadline: NOW - 1 }, "GCREATOR", NOW)).toMatchObject({
      ok: false,
      status: 409,
      code: "legacy_registry",
    });
    expect(closePreflightForRef(REAL, { ...base, deadline: NOW - 1 }, "GCREATOR", NOW)).toEqual({ ok: true });
  });
});

describe("closePreflight (server close route)", () => {
  const expired = { ...base, deadline: NOW - 1 };
  it("lets the creator close an expired or sold out chest", () => {
    expect(closePreflight(expired, "GCREATOR", NOW)).toEqual({ ok: true });
    expect(closePreflight({ ...base, claims: 3 }, "GCREATOR", NOW)).toEqual({ ok: true });
  });
  it("404 when the chest is not on-chain", () => {
    expect(closePreflight(null, "GCREATOR", NOW)).toMatchObject({ ok: false, status: 404, code: "not_created" });
  });
  it("409 while active and when already closed, with the reason", () => {
    expect(closePreflight(base, "GCREATOR", NOW)).toMatchObject({ ok: false, status: 409, code: "still_active", error: expect.stringMatching(/after the deadline/) });
    expect(closePreflight({ ...expired, closed: true }, "GCREATOR", NOW)).toMatchObject({ ok: false, status: 409, code: "already_closed" });
  });
  it("403 when the signing key is not the creator (the contract would reject it)", () => {
    expect(closePreflight(expired, "GOTHER", NOW)).toMatchObject({ ok: false, status: 403, code: "not_creator", error: expect.stringMatching(/dashboard/i) });
  });
});
