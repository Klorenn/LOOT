import type { SetItem, SetProgress } from "./chest-set-create";

/**
 * Recovery record for a set being created. Kept in this browser's localStorage so that if the user
 * rejects a signature, closes the tab or loses the connection halfway, the chests that DO exist are
 * not forgotten and creation can continue from where it stopped.
 *
 * It holds no answers: only what `runSetCreation` needs (public question text, fingerprints, per-question
 * salts, prizes) plus the progress. Salts matter only for private sets (they are in the link); the record
 * never leaves the device.
 */
export type SetDraft = {
  v: 1;
  net: string;
  title: string;
  listed: boolean;
  /** unix seconds, same for every chest in the set */
  deadline: number;
  items: SetItem[];
  progress: SetProgress;
};

type Wire = Omit<SetDraft, "items"> & { items: Array<Omit<SetItem, "prizeStroops"> & { prizeStroops: string }> };

export const draftKey = (net: string) => `loot.set-draft.${net}`;

export function serializeDraft(d: SetDraft): string {
  const wire: Wire = { ...d, items: d.items.map((i) => ({ ...i, prizeStroops: i.prizeStroops.toString() })) };
  return JSON.stringify(wire);
}

/** null when missing or malformed (a corrupt record must never break /create). */
export function parseDraft(raw: string | null): SetDraft | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(raw) as Wire;
    if (w?.v !== 1 || typeof w.net !== "string" || typeof w.title !== "string" || !Array.isArray(w.items) || !w.progress) return null;
    if (!Number.isSafeInteger(w.deadline) || !Array.isArray(w.progress.members)) return null;
    const items: SetItem[] = w.items.map((i) => {
      if (!Number.isSafeInteger(i.index) || !/^[0-9a-f]{64}$/.test(i.fingerprintHex) || !/^\d{1,80}$/.test(i.salt) || typeof i.question !== "string")
        throw new Error("bad item");
      return { ...i, prizeStroops: BigInt(i.prizeStroops) };
    });
    return { ...w, items };
  } catch {
    return null;
  }
}

/** Questions that still have no chest on-chain. */
export const remainingCount = (d: SetDraft) => d.items.length - d.progress.members.filter((m) => m.chestId !== undefined).length;

/** A draft is worth showing only while something is unfinished (missing chests or unsaved details). */
export const isUnfinished = (d: SetDraft) => remainingCount(d) > 0 || d.progress.members.some((m) => !m.saved);
