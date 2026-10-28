import { NextResponse, type NextRequest } from "next/server";
import type { NetConfig } from "./network";
import { clientIp } from "./rate-limit";
import { blobMarkerStore, gateDenial, persistentGate, type RelayScope } from "./persistent-limit";
import { testnetFeatures } from "./testnet-features";

/**
 * Gate for a relayed request: the persistent Blob-backed limits (see lib/persistent-limit.ts). Testnet only for
 * now (lib/testnet-features.ts): on mainnet this is a pass-through and the in-memory limits of the routes apply
 * exactly as before.
 */
export async function relayGate(
  req: NextRequest,
  c: NetConfig,
  scope: RelayScope,
  deploy = false,
): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; res: NextResponse }> {
  if (!testnetFeatures(c)) return { ok: true, release: async () => undefined };
  const g = await persistentGate({ store: blobMarkerStore, net: c.net, mainnet: false, scope, ip: clientIp(req), deploy });
  if (g.ok) return g;
  const d = gateDenial(g.reason);
  return { ok: false, res: NextResponse.json(d.body, { status: d.status, headers: d.retryAfter ? { "retry-after": d.retryAfter } : undefined }) };
}
