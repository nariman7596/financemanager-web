import type { LocalStore } from "./store/interface";
import {
  AuthRequiredError, PermanentPushError,
  type LocalRow, type OutboxEntry, type PushOp, type SyncEntity, type SyncTransport,
} from "./types";
import { uuidv7 } from "./ids";

// ---------------------------------------------------------------------------
// The offline engine.
//
// The UI reads and writes the LOCAL store and nothing else; this moves data
// between that store and the server in the background. No screen ever waits on
// the network, which is what makes offline a non-event rather than a mode.
// ---------------------------------------------------------------------------

/**
 * FK dependency order. An account has to exist before a transaction can point
 * at it, so a batch is sent in this order however the user happened to make
 * the edits. The server sorts the same way; doing it here too keeps a batch
 * coherent even if it is split across pushes.
 */
const ENTITY_ORDER: Record<SyncEntity, number> = {
  account: 1, category: 1, transaction: 2, budget: 3, investment: 3,
};

export interface EngineOptions {
  store: LocalStore;
  transport: SyncTransport;
  householdId: string;
  deviceId: string;
  /** Ops per push. The server caps a batch at 500. */
  batchSize?: number;
  /** Attempts before an op is quarantined so it stops blocking the queue. */
  maxAttempts?: number;
  now?: () => number;
  /** Injectable for deterministic backoff in tests. */
  random?: () => number;
  onChange?: () => void;
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  conflicts: number;
  quarantined: number;
  /** Set when sync stopped early. The outbox is intact either way. */
  stoppedBecause?: "offline" | "auth";
}

const cursorKey = (householdId: string) => `cursor:${householdId}`;

export function createEngine(options: EngineOptions) {
  const {
    store, transport, householdId, deviceId,
    batchSize = 200, maxAttempts = 5,
    now = () => Date.now(), random = Math.random,
    onChange,
  } = options;

  /**
   * Exponential backoff with jitter, capped at five minutes.
   *
   * The jitter is not decoration: without it, every device that lost
   * connectivity at the same moment retries at the same moment, and the server
   * gets a thundering herd exactly when it is least able to take one.
   */
  function backoffMs(attempts: number): number {
    const base = Math.min(1000 * 2 ** attempts, 5 * 60_000);
    return Math.round(base * (0.5 + random() * 0.5));
  }

  // --- local-first writes ---------------------------------------------------

  /**
   * Apply a change locally and queue it for the server.
   *
   * Returns as soon as the local write is done — typically a few milliseconds,
   * and identical whether or not there is a network.
   */
  async function mutate(
    entity: SyncEntity,
    input: { id?: string; [field: string]: unknown },
  ): Promise<LocalRow> {
    const id = (input.id as string) ?? uuidv7();
    const existing = await store.get(entity, id);

    const row: LocalRow = {
      ...(existing ?? {}),
      ...input,
      id,
      householdId,
      revision: existing?.revision ?? "0",
      deletedAt: existing?.deletedAt ?? null,
    };
    await store.put(entity, row);
    await queue(entity, id, "upsert", stripLocalFields(row), existing?.revision ?? null, !existing);
    onChange?.();
    return row;
  }

  /** Tombstone locally and queue the delete. */
  async function remove(entity: SyncEntity, id: string): Promise<void> {
    const existing = await store.get(entity, id);
    if (!existing) return;
    await store.put(entity, { ...existing, deletedAt: new Date(now()).toISOString() });
    await queue(entity, id, "delete", {}, existing.revision, false);
    onChange?.();
  }

  /**
   * Add to the outbox, coalescing onto an entry that has not been sent yet.
   *
   * Coalescing is not an optimisation, it is a correctness fix. Two separate
   * ops for the same row would carry the SAME baseRevision — the row has not
   * been pushed, so its local revision never moved — and the server would apply
   * the first, bump the revision, then see the second arrive with a stale base
   * and record a conflict against this device's own earlier edit.
   */
  async function queue(
    entity: SyncEntity,
    entityId: string,
    op: "upsert" | "delete",
    payload: Record<string, unknown>,
    baseRevision: string | null,
    isCreate: boolean,
  ) {
    const pending = await store.pendingFor(entity, entityId);
    if (pending) {
      await store.updateOutbox(pending.opId, {
        op,
        payload: op === "delete" ? {} : { ...pending.payload, ...payload },
      });
      return;
    }
    await store.enqueue({
      opId: uuidv7(),
      householdId,
      entity,
      entityId,
      op,
      // A create has no base revision: it cannot conflict, because the id was
      // generated here and the server has never seen the row.
      baseRevision: isCreate ? null : baseRevision,
      payload,
      attempts: 0,
      nextAttemptAt: 0,
      status: "pending",
      lastError: null,
    });
  }

  function stripLocalFields(row: LocalRow): Record<string, unknown> {
    const { id: _id, householdId: _h, revision: _r, deletedAt: _d, ...rest } = row;
    return rest;
  }

  // --- push -----------------------------------------------------------------

  async function push(): Promise<Pick<SyncOutcome, "pushed" | "conflicts" | "quarantined"> & {
    stoppedBecause?: "offline" | "auth";
  }> {
    let pushed = 0, conflicts = 0, quarantined = 0;

    for (;;) {
      const due = await store.dueOutbox(householdId, now(), batchSize);
      if (due.length === 0) return { pushed, conflicts, quarantined };

      const batch = [...due].sort(
        (a, b) => ENTITY_ORDER[a.entity] - ENTITY_ORDER[b.entity] || a.seq - b.seq,
      );
      const ops: PushOp[] = batch.map((e) => ({
        opId: e.opId, entity: e.entity, id: e.entityId, op: e.op,
        baseRevision: e.baseRevision, payload: e.payload,
      }));

      try {
        const result = await transport.push(deviceId, ops);
        // Applied ops leave the queue. The server is idempotent by opId, so a
        // response lost in transit costs a duplicate request, never a
        // duplicate row.
        await store.removeOutbox(result.applied.map((a) => a.opId));
        pushed += result.applied.length;
        conflicts += result.conflicts.length;
        // A conflict is a decided outcome, not a failure: the server kept the
        // losing value for review, so the op must not be retried.
        await store.removeOutbox(result.conflicts.map((c) => c.opId));
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          // Never drop unsent writes because a token expired. They wait.
          return { pushed, conflicts, quarantined, stoppedBecause: "auth" };
        }

        const permanent = error instanceof PermanentPushError ? error : null;
        const named = new Set(permanent?.opIds ?? []);
        const message = String((error as Error)?.message ?? error);

        for (const entry of batch) {
          if (named.size > 0 && !named.has(entry.opId)) {
            // The server named which ops it rejected, so this one is innocent:
            // it simply travelled in a doomed batch. Backing it off too would
            // delay good writes behind a bad row by an exponentially growing
            // wait — which is the freezing that quarantine exists to prevent.
            // It stays due, and goes out on the next pass without the bad one.
            continue;
          }
          const targeted = named.has(entry.opId);
          const attempts = entry.attempts + 1;
          const doomed = targeted || attempts >= maxAttempts;
          await store.updateOutbox(entry.opId, {
            attempts,
            status: doomed ? "quarantined" : "pending",
            nextAttemptAt: doomed ? 0 : now() + backoffMs(attempts),
            lastError: message,
          });
          if (doomed) quarantined++;
        }
        // One bad row must never freeze the queue: quarantined entries are set
        // aside and the loop stops for this pass, so the rest go next time.
        return {
          pushed, conflicts, quarantined,
          stoppedBecause: permanent ? undefined : "offline",
        };
      }
    }
  }

  // --- pull -----------------------------------------------------------------

  async function pull(): Promise<{ pulled: number; stoppedBecause?: "offline" | "auth" }> {
    let pulled = 0;
    let cursor = (await store.getMeta(cursorKey(householdId))) ?? "0";

    for (;;) {
      let page;
      try {
        page = await transport.changes(cursor);
      } catch (error) {
        return {
          pulled,
          stoppedBecause: error instanceof AuthRequiredError ? "auth" : "offline",
        };
      }

      for (const change of page.changes) {
        const entity = change.entity as SyncEntity;
        // THE INVARIANT: a pending local edit outranks anything arriving from
        // the server for the same row, until it has been pushed. Overwriting
        // here would silently discard something the user typed while offline.
        // The row is not lost by skipping: pushing it bumps the server's
        // revision, so a later pull delivers the settled value.
        if (await store.pendingFor(entity, change.id)) continue;

        await store.put(entity, {
          ...(change as unknown as LocalRow),
          revision: String(change.revision),
          deletedAt: change.deletedAt ?? null,
        });
        pulled++;
      }

      cursor = page.nextCursor;
      await store.setMeta(cursorKey(householdId), cursor);
      if (!page.hasMore) break;
    }

    if (pulled) onChange?.();
    return { pulled };
  }

  // --- the loop -------------------------------------------------------------

  /**
   * Push first, then pull.
   *
   * That order matters: pushing first means the server has this device's edits
   * before it answers with its own view, so the pull that follows returns the
   * settled result — including any conflict the push produced — rather than a
   * version this device is about to overwrite anyway.
   */
  async function sync(): Promise<SyncOutcome> {
    const pushResult = await push();
    if (pushResult.stoppedBecause) {
      return { ...pushResult, pulled: 0, stoppedBecause: pushResult.stoppedBecause };
    }
    const pullResult = await pull();
    return {
      pushed: pushResult.pushed,
      conflicts: pushResult.conflicts,
      quarantined: pushResult.quarantined,
      pulled: pullResult.pulled,
      stoppedBecause: pullResult.stoppedBecause,
    };
  }

  return {
    mutate,
    remove,
    push,
    pull,
    sync,

    /** Rows for the UI. Always local, never a network call. */
    list: (entity: SyncEntity) => store.list(entity, householdId),
    get: (entity: SyncEntity, id: string) => store.get(entity, id),

    /** Unsent work, for an "N changes pending" indicator. */
    pending: async () =>
      (await store.allOutbox(householdId)).filter((e) => e.status === "pending"),
    quarantined: async () =>
      (await store.allOutbox(householdId)).filter((e) => e.status === "quarantined"),

    /**
     * Give up on a quarantined op and take the server's version.
     *
     * The cursor is reset because the pull that skipped this row (pending-wins)
     * has already moved past the server's copy of it, so a normal pull would
     * never deliver it again. A full re-pull is heavy but this is a rare,
     * explicitly user-driven path, and correctness beats cleverness here.
     */
    async discard(opId: string) {
      const entry = (await store.allOutbox(householdId)).find((e) => e.opId === opId);
      if (!entry) return false;
      await store.removeOutbox([opId]);
      await store.setMeta(cursorKey(householdId), "0");
      onChange?.();
      return true;
    },

    /** Retry a quarantined op (e.g. after the user fixed whatever was wrong). */
    async retry(opId: string) {
      await store.updateOutbox(opId, { status: "pending", attempts: 0, nextAttemptAt: 0 });
    },

    cursor: () => store.getMeta(cursorKey(householdId)),
  };
}

export type SyncEngine = ReturnType<typeof createEngine>;
export type { OutboxEntry };
