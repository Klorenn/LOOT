/**
 * Real state of a chest for /panel, from its on-chain record. Mirrors `close_chest` in the registry contract:
 * the creator can close only after the deadline (`now > deadline`) or once every place was claimed, and only once.
 * Pure module (unit-tested).
 */
import { isLegacyV2Ref } from "./registry";

export type PanelChain = { closed: boolean; claims: number; maxClaims: number; deadline: number; creator: string };
export type PanelStatus = "open" | "sold_out" | "expired" | "closed" | "not_created" | "legacy";
export type PanelState = { status: PanelStatus; canClose: boolean; note: string };

export function panelState(c: PanelChain | null, nowSec: number = Math.floor(Date.now() / 1000)): PanelState {
  if (!c) return { status: "not_created", canClose: false, note: "This chest is not on-chain (creation was never confirmed)." };
  if (c.closed) return { status: "closed", canClose: false, note: "Already closed: the remaining prize went back to the creator." };
  if (c.claims >= c.maxClaims) return { status: "sold_out", canClose: true, note: "Every place was claimed. The creator can close it." };
  if (c.deadline && nowSec > c.deadline) return { status: "expired", canClose: true, note: "Expired. The creator can close it and recover the unclaimed prize." };
  const date = c.deadline ? new Date(c.deadline * 1000).toISOString().slice(0, 10) : "";
  return {
    status: "open",
    canClose: false,
    note: `Still active. It can be closed after the deadline${date ? ` (${date})` : ""} or once all places are claimed.`,
  };
}

export type ClosePreflight = { ok: true } | { ok: false; status: 403 | 404 | 409; code: "not_created" | "legacy_registry" | "already_closed" | "still_active" | "not_creator"; error: string };

/** Checks before the server signs `close_chest`, so the panel gets a clear reason instead of a contract error. */
export function closePreflight(c: PanelChain | null, signerPublicKey: string, nowSec: number = Math.floor(Date.now() / 1000)): ClosePreflight {
  const s = panelState(c, nowSec);
  if (s.status === "not_created") return { ok: false, status: 404, code: "not_created", error: s.note };
  if (s.status === "closed") return { ok: false, status: 409, code: "already_closed", error: s.note };
  if (!s.canClose) return { ok: false, status: 409, code: "still_active", error: s.note };
  if (c!.creator !== signerPublicKey)
    return {
      ok: false,
      status: 403,
      code: "not_creator",
      error: "Only the creator's wallet can close this chest, and the panel key is not it. Close it from /dashboard with the creator's account.",
    };
  return { ok: true };
}

const LEGACY_NOTE = "This chest belongs to the previous testnet registry, which was replaced. It can no longer be managed from this panel.";

/** `panelState` for a stored chest ref: refs of the previous testnet registry are `legacy`, not `not_created`. */
export function panelStateForRef(ref: number, c: PanelChain | null, nowSec?: number): PanelState {
  if (isLegacyV2Ref(ref)) return { status: "legacy", canClose: false, note: LEGACY_NOTE };
  return panelState(c, nowSec);
}

/** `closePreflight` for a chest ref: legacy refs are refused before anything is read from (or signed on) the new registry. */
export function closePreflightForRef(ref: number, c: PanelChain | null, signerPublicKey: string, nowSec?: number): ClosePreflight {
  if (isLegacyV2Ref(ref)) return { ok: false, status: 409, code: "legacy_registry", error: LEGACY_NOTE };
  return closePreflight(c, signerPublicKey, nowSec);
}
