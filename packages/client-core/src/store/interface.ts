import type { LocalRow, OutboxEntry, OutboxStatus, SyncEntity } from "../types";

/**
 * The local database, as the engine sees it.
 *
 * Deliberately small. Every adapter — in-memory for tests, SQLite on a phone,
 * IndexedDB in a browser — implements exactly this, so the engine (which is
 * the part with the interesting bugs) is written once and tested without a
 * device.
 */
export interface LocalStore {
  // --- rows -----------------------------------------------------------------
  get(entity: SyncEntity, id: string): Promise<LocalRow | null>;
  /** Live rows for a household. Tombstones are excluded unless asked for. */
  list(
    entity: SyncEntity,
    householdId: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<LocalRow[]>;
  put(entity: SyncEntity, row: LocalRow): Promise<void>;
  putMany(entity: SyncEntity, rows: LocalRow[]): Promise<void>;
  /** Remove locally and for good. Used by the tombstone sweep, not by deletes:
   *  a user delete becomes a tombstone so other devices learn about it. */
  hardDelete(entity: SyncEntity, id: string): Promise<void>;

  // --- outbox ---------------------------------------------------------------
  enqueue(entry: Omit<OutboxEntry, "seq">): Promise<OutboxEntry>;
  /** Pending entries due now, oldest first. */
  dueOutbox(householdId: string, now: number, limit?: number): Promise<OutboxEntry[]>;
  /** Every entry, including quarantined, for inspection and for the
   *  pending-wins rule. */
  allOutbox(householdId?: string): Promise<OutboxEntry[]>;
  /** The pending entry for a row, if any. */
  pendingFor(entity: SyncEntity, id: string): Promise<OutboxEntry | null>;
  updateOutbox(
    opId: string,
    patch: Partial<
      Pick<
        OutboxEntry,
        "attempts" | "nextAttemptAt" | "status" | "lastError" | "payload" | "op"
      >
    >,
  ): Promise<void>;
  removeOutbox(opIds: string[]): Promise<void>;

  // --- metadata (cursors, device id) ---------------------------------------
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export type { LocalRow, OutboxEntry, OutboxStatus, SyncEntity };
