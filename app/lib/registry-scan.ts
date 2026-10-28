import { scValToNative, type xdr } from "@stellar/stellar-sdk";

/**
 * Registry v2 shares ONE id counter between chests and sets (create_set is permissionless), so ids of sets are
 * holes in the chest list and any number of them can be consecutive. The scan is therefore bounded by the
 * contract's own counter (`NextId`, read from the instance storage), never by "a run of empty ids".
 */

/** `NextId` from the contract instance storage map, or null when absent/unreadable. */
export function nextIdFromStorage(storage: xdr.ScMapEntry[] | null | undefined): number | null {
  for (const e of storage ?? []) {
    try {
      const k = scValToNative(e.key()) as unknown;
      if (Array.isArray(k) && k[0] === "NextId") {
        const n = Number(scValToNative(e.val()));
        return Number.isSafeInteger(n) && n >= 1 ? n : null;
      }
    } catch {
      /* not the key we look for */
    }
  }
  return null;
}

/**
 * Reads ids 1..nextId-1 (capped at `cap`) in chunks; `read` returns null for ids that are not chests (sets).
 * Any other error propagates so an incomplete list is never cached.
 */
export async function scanUpTo<T>(nextId: number, read: (id: number) => Promise<T | null>, cap = 2000, chunk = 6): Promise<T[]> {
  const last = Math.min(nextId - 1, cap);
  const out: T[] = [];
  for (let start = 1; start <= last; start += chunk) {
    const ids = Array.from({ length: Math.min(chunk, last - start + 1) }, (_, i) => start + i);
    for (const r of await Promise.all(ids.map(read))) if (r !== null) out.push(r);
  }
  return out;
}
