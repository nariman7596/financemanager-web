import type { ChangesPage, PushOp, PushResult, SyncEntity } from "@financemanager/api-client";

export type { ChangesPage, PushOp, PushResult, SyncEntity };

/** A locally stored row. Mirrors the server's shape plus local bookkeeping. */
export interface LocalRow {
  id: string;
  householdId: string;
  /** Server revision, as a string. "0" for a row this device created and has
   *  not pushed yet. Compare with BigInt — a JSON number loses precision. */
  revision: string;
  deletedAt: string | null;
  [field: string]: unknown;
}

export type OutboxStatus = "pending" | "quarantined";

export interface OutboxEntry {
  /** Client-generated, stable across every retry. This is what makes a push
   *  after a timeout safe: the server applies it once. */
  opId: string;
  householdId: string;
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  /** Revision the row was at when the edit was made; null for a create. */
  baseRevision: string | null;
  payload: Record<string, unknown>;
  /** Monotonic, assigned on enqueue. Preserves FIFO within a household. */
  seq: number;
  attempts: number;
  /** Epoch ms; the entry is not retried before this. Set by backoff. */
  nextAttemptAt: number;
  status: OutboxStatus;
  lastError: string | null;
}

/** Everything the engine needs from a transport. Narrow on purpose so tests
 *  can supply a fake without standing up an HTTP server. */
export interface SyncTransport {
  changes(cursor: string, limit?: number): Promise<ChangesPage>;
  push(deviceId: string, ops: PushOp[]): Promise<PushResult>;
}

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** Thrown by a transport when the server rejected the op itself (a 4xx that
 *  retrying cannot fix). Distinguishing this from a network failure is what
 *  keeps one bad row from blocking the queue forever. */
export class PermanentPushError extends Error {
  constructor(message: string, readonly opIds: string[] = []) {
    super(message);
    this.name = "PermanentPushError";
  }
}
