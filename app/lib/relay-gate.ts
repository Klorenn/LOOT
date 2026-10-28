import { NextResponse, type NextRequest } from "next/server";
import type { NetConfig } from "./network";
import { clientIp } from "./rate-limit";
import { blobMarkerStore, gateDenial, persistentGate, type RelayScope } from "./persistent-limit";
import { blocksRelay, verifierGuard } from "./verifier-check";
import { simulateRead } from "./chain";

/**
 * Gate for a relayed request: (mainnet) registry/verifier config check, then the persistent Blob-backed limits
 * (see lib/persistent-limit.ts for the fail behavior).
 */
export async function relayGate(
  req: NextRequest,
  c: NetConfig,
  scope: RelayScope,
  deploy = false,
): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; res: NextResponse }> {
  if (c.IS_MAINNET) {
    // v1 (no verifier getter: no-op) and, when configured, v2 (verifier() must equal the configured verifier)
    const checks = [
      { registryId: c.CONTRACTS.chest, expectedVerifier: c.CONTRACTS.verifier },
      ...(c.REGISTRY_V2.chest ? [{ registryId: c.REGISTRY_V2.chest, expectedVerifier: c.REGISTRY_V2.verifier }] : []),
    ];
    const results = await Promise.all(
      checks.map((k) => verifierGuard({ mainnet: true, ...k, read: (id, method) => simulateRead(id, method, []) })),
    );
    if (results.some(blocksRelay)) {
      console.error("relay blocked: a registry verifier does not match the configured verifier id");
      return { ok: false, res: NextResponse.json({ error: "Sponsored transactions are paused.", code: "config_mismatch" }, { status: 503 }) };
    }
  }
  const g = await persistentGate({ store: blobMarkerStore, net: c.net, mainnet: c.IS_MAINNET, scope, ip: clientIp(req), deploy });
  if (g.ok) return g;
  const d = gateDenial(g.reason);
  return { ok: false, res: NextResponse.json(d.body, { status: d.status, headers: d.retryAfter ? { "retry-after": d.retryAfter } : undefined }) };
}
