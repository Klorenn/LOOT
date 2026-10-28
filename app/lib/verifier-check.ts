/**
 * Mainnet check: the verifier the registry was initialised with must be the one the app is configured for
 * (MAINNET_VERIFIER_ID). A mismatch means the app's config and the on-chain registry disagree about which
 * verifying key protects the prizes, so the relayer must not sponsor anything until it is fixed.
 *
 * The CURRENT mainnet registry has no getter for its verifier (only `init` stores it), so the read is
 * "unsupported" and the check is a no-op.
 * TODO(registry v2): the new registry exposes the verifier (and token, deadline bounds). When it does, set
 * VERIFIER_GETTER to its method name; `checkRegistryVerifier` then enforces the match with no other change.
 */
export const VERIFIER_GETTER: string | null = null;

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
let cached: { at: number; result: VerifierCheck } | null = null;
const TTL_MATCH_MS = 10 * 60_000;
const TTL_ERROR_MS = 30_000;

export async function verifierGuard(i: Parameters<typeof checkRegistryVerifier>[0], now = Date.now()): Promise<VerifierCheck> {
  if (!i.mainnet) return { status: "skipped", reason: "testnet" };
  if (cached && now - cached.at < (cached.result.status === "error" ? TTL_ERROR_MS : TTL_MATCH_MS)) return cached.result;
  const result = await checkRegistryVerifier(i);
  cached = { at: now, result };
  return result;
}

export function resetVerifierGuard(): void {
  cached = null;
}
