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
    const v = await verifierGuard({
      mainnet: true,
      registryId: c.CONTRACTS.chest,
      expectedVerifier: c.CONTRACTS.verifier,
      read: (id, method) => simulateRead(id, method, []),
    });
    if (blocksRelay(v)) {
      console.error("relay blocked: registry verifier does not match MAINNET_VERIFIER_ID");
      return { ok: false, res: NextResponse.json({ error: "Sponsored transactions are paused.", code: "config_mismatch" }, { status: 503 }) };
    }
  }
  const g = await persistentGate({ store: blobMarkerStore, net: c.net, mainnet: c.IS_MAINNET, scope, ip: clientIp(req), deploy });
  if (g.ok) return g;
  const d = gateDenial(g.reason);
  return { ok: false, res: NextResponse.json(d.body, { status: d.status, headers: d.retryAfter ? { "retry-after": d.retryAfter } : undefined }) };
}
