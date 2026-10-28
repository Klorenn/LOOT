/**
 * Orchestrates creating a chest set one chest at a time (N transactions = N signatures) and keeps
 * a record of what exists so a failure halfway leaves a consistent, recoverable set.
 *
 * Invariants:
 *  - Question 1 (index 0) is created and CONFIRMED first: its chest id is the set id, and the server
 *    only accepts later members once that header exists.
 *  - Every member is its own on-chain chest, funded by its own transaction. If the user rejects or the
 *    network fails at question k, questions 1..k-1 stay live and funded; k..N were never created and
 *    nothing was charged for them.
 *  - `progress` is plain data (no secrets): safe to keep in memory or localStorage, and passing it back
 *    to `runSetCreation` resumes where it stopped (already-created chests are never created twice).
 *
 * Pure orchestration: all I/O is injected so it is unit-tested without a chain.
 */

export type SetItem = {
  index: number;
  /** 64 hex chars, Poseidon(answer, salt) */
  fingerprintHex: string;
  /** decimal salt (kept so private-set links can be rebuilt) */
  salt: string;
  question: string;
  hint?: string;
  prizeStroops: bigint;
};

export type MemberProgress = {
  index: number;
  chestId?: number;
  hash?: string;
  /** details published to the server (confirm succeeded) */
  saved: boolean;
};

export type SetProgress = {
  /**
   * Set id (a "ref", lib/registry.ts). Registry v1: the chest id of question 1, known once it is created.
   * Registry v2: allocated on-chain by `create_set` BEFORE question 1, so it is known up front.
   */
  setId?: number;
  members: MemberProgress[];
};

export type SetCreateDeps = {
  reserve(item: SetItem, setId: number | undefined): Promise<void>;
  /** `setId` is set when the set already exists on-chain (registry v2): the chest must be created inside it. */
  create(item: SetItem, setId: number | undefined): Promise<{ chestId: number; hash: string }>;
  /**
   * Registry v2 only: allocates the set on-chain (`create_set`). When present, it runs once before the first
   * chest (a retry reuses `progress.setId`, so a set is never allocated twice). Registry v1: omit.
   */
  createSet?(): Promise<{ setId: number; hash: string }>;
  confirm(item: SetItem, chestId: number, hash: string, setId: number): Promise<void>;
  /** called after each state change; index = question being worked on (0-based) */
  onProgress?(p: SetProgress, working: number | null): void;
  /** confirm attempts per member (default 3) */
  confirmAttempts?: number;
};

export type SetCreateResult =
  | { status: "complete"; progress: SetProgress }
  | {
      status: "partial" | "failed";
      progress: SetProgress;
      /** question index where it stopped */
      failedAt: number;
      stage: "reserve" | "create" | "save";
      message: string;
    };

export const emptyProgress = (): SetProgress => ({ members: [] });

const memberOf = (p: SetProgress, index: number) => p.members.find((m) => m.index === index);

function upsert(p: SetProgress, m: MemberProgress): SetProgress {
  return { ...p, members: [...p.members.filter((x) => x.index !== m.index), m].sort((a, b) => a.index - b.index) };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createdCount(p: SetProgress): number {
  return p.members.filter((m) => m.chestId !== undefined).length;
}

/** Next question that has no on-chain chest yet, or null when all exist. */
export function nextToCreate(p: SetProgress, size: number): number | null {
  for (let i = 0; i < size; i++) if (memberOf(p, i)?.chestId === undefined) return i;
  return null;
}

export async function runSetCreation(items: readonly SetItem[], deps: SetCreateDeps, start: SetProgress = emptyProgress()): Promise<SetCreateResult> {
  let progress = start;
  const attempts = Math.max(1, deps.confirmAttempts ?? 3);
  const ordered = [...items].sort((a, b) => a.index - b.index);
  const emit = (working: number | null) => deps.onProgress?.(progress, working);

  const fail = (item: SetItem, stage: "reserve" | "create" | "save", message: string): SetCreateResult => {
    emit(null);
    return { status: createdCount(progress) > 0 ? "partial" : "failed", progress, failedAt: item.index, stage, message };
  };

  if (deps.createSet && progress.setId === undefined && ordered.length > 0) {
    emit(ordered[0].index);
    try {
      const made = await deps.createSet();
      progress = { ...progress, setId: made.setId };
      emit(ordered[0].index);
    } catch (e) {
      return fail(ordered[0], "create", msg(e));
    }
  }

  for (const item of ordered) {
    const done = memberOf(progress, item.index);

    if (done?.chestId === undefined) {
      // Not on-chain yet: reserve details, then fund + create.
      emit(item.index);
      try {
        await deps.reserve(item, progress.setId);
      } catch (e) {
        return fail(item, "reserve", msg(e));
      }
      let created: { chestId: number; hash: string };
      try {
        created = await deps.create(item, progress.setId);
      } catch (e) {
        return fail(item, "create", msg(e));
      }
      progress = upsert(progress, { index: item.index, chestId: created.chestId, hash: created.hash, saved: false });
      // registry v1: question 1 IS the set (its chest id); registry v2 already has the set id from create_set
      if (item.index === 0 && progress.setId === undefined) progress = { ...progress, setId: created.chestId };
      emit(item.index);
    }

    const cur = memberOf(progress, item.index)!;
    if (!cur.saved) {
      let ok = false;
      let last = "";
      for (let a = 0; a < attempts && !ok; a++) {
        try {
          await deps.confirm(item, cur.chestId!, cur.hash ?? "", progress.setId ?? cur.chestId!);
          ok = true;
        } catch (e) {
          last = msg(e);
        }
      }
      if (ok) {
        progress = upsert(progress, { ...cur, saved: true });
        emit(item.index);
      } else if (item.index === 0) {
        // Without the header the later members can't be accepted: stop here, the chest exists on-chain.
        return fail(item, "save", last);
      } else {
        // Later members can be saved afterwards (retry); the chest is already funded, keep going.
        emit(item.index);
      }
    }
  }

  emit(null);
  const unsaved = progress.members.find((m) => !m.saved);
  if (unsaved) {
    const item = ordered.find((i) => i.index === unsaved.index)!;
    return { status: "partial", progress, failedAt: unsaved.index, stage: "save", message: `Details for question ${item.index + 1} were not published yet.` };
  }
  return { status: "complete", progress };
}
