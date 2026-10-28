/**
 * Mainnet check: the verifier the registry was initialised with must be the one the app is configured for
 * (MAINNET_VERIFIER_ID). A mismatch means the app's config and the on-chain registry disagree about which
 * verifying key protects the prizes, so the relayer must not sponsor anything until it is fixed.
 *
 * Registry v2 exposes `verifier()`, so the check is active for it. The v1 registry has no such getter (only `init`
 * stores it): the read fails with "no such function", the result is "unsupported" and the check is a no-op for v1.
 */
export const VERIFIER_GETTER: string | null = "verifier";

export type VerifierCheck =
  | { status: "skipped"; reason: "testnet" | "no_expected" }
  | { status: "unsupported" }
  | { status: "match" }
  | { status: "mismatch" }
  | { status: "error" };

/** Reads the registry's verifier id; throws on RPC/simulation errors. Injected so tests mock the RPC. */
export type ReadVerifier = (registryId: string, method: string) => Promise<unknown>;

const NO_SUCH_FUNCTION = /non-existent|MissingValue|no such function|function.*not found|UnreachableCodeReached/i;

export async function checkRegistryVerifier(i: {
  mainnet: boolean;
  registryId: string;
  expectedVerifier: string;
  read: ReadVerifier;
  getter?: string | null;
}): Promise<VerifierCheck> {
  if (!i.mainnet) return { status: "skipped", reason: "testnet" };
  if (!i.expectedVerifier) return { status: "skipped", reason: "no_expected" };
  const getter = i.getter === undefined ? VERIFIER_GETTER : i.getter;
  if (!getter) return { status: "unsupported" };
  try {
    const got = await i.read(i.registryId, getter);
    return String(got) === i.expectedVerifier ? { status: "match" } : { status: "mismatch" };
  } catch (e) {
    return NO_SUCH_FUNCTION.test(e instanceof Error ? e.message : String(e)) ? { status: "unsupported" } : { status: "error" };
  }
}

/** Only a proven mismatch blocks relaying; "error" (RPC down) does not, those routes fail on their own. */
export const blocksRelay = (r: VerifierCheck): boolean => r.status === "mismatch";

// ---------- Cached runtime guard (first mainnet request, then re-checked) ----------
// one entry per registry: v1 and v2 are checked independently
const cached = new Map<string, { at: number; result: VerifierCheck }>();
const TTL_MATCH_MS = 10 * 60_000;
const TTL_ERROR_MS = 30_000;

export async function verifierGuard(i: Parameters<typeof checkRegistryVerifier>[0], now = Date.now()): Promise<VerifierCheck> {
  if (!i.mainnet) return { status: "skipped", reason: "testnet" };
  const hit = cached.get(i.registryId);
  if (hit && now - hit.at < (hit.result.status === "error" ? TTL_ERROR_MS : TTL_MATCH_MS)) return hit.result;
  const result = await checkRegistryVerifier(i);
  cached.set(i.registryId, { at: now, result });
  return result;
}

export function resetVerifierGuard(): void {
  cached.clear();
}
