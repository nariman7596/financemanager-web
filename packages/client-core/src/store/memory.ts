import type { LocalStore } from "./interface";
import type { LocalRow, OutboxEntry, SyncEntity } from "../types";

/**
 * In-memory LocalStore.
 *
 * Not just a test double: it is the reference implementation the SQL adapter is
 * checked against, and it is what lets the whole engine — outbox ordering,
 * backoff, quarantine, conflict handling — be tested without a simulator. The
 * riskiest logic in the project should not be debugged through a device.
 */
export function createMemoryStore(): LocalStore {
  const rows = new Map<string, Map<string, LocalRow>>();
  const outbox = new Map<string, OutboxEntry>();
  const meta = new Map<string, string>();
  let seq = 0;

  const table = (entity: SyncEntity) => {
    let t = rows.get(entity);
    if (!t) rows.set(entity, (t = new Map()));
    return t;
  };
  const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

  return {
    async get(entity, id) {
      return clone(table(entity).get(id) ?? null);
    },
    async list(entity, householdId, opts) {
      return [...table(entity).values()]
        .filter((r) => r.householdId === householdId && (opts?.includeDeleted || !r.deletedAt))
        .map(clone);
    },
    async put(entity, row) {
      table(entity).set(row.id, clone(row));
    },
    async putMany(entity, list) {
      for (const row of list) table(entity).set(row.id, clone(row));
    },
    async hardDelete(entity, id) {
      table(entity).delete(id);
    },

    async enqueue(entry) {
      const full: OutboxEntry = { ...clone(entry), seq: ++seq } as OutboxEntry;
      outbox.set(full.opId, full);
      return clone(full);
    },
    async dueOutbox(householdId, now, limit = 100) {
      return [...outbox.values()]
        .filter(
          (e) => e.householdId === householdId && e.status === "pending" && e.nextAttemptAt <= now,
        )
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        .map(clone);
    },
    async allOutbox(householdId) {
      return [...outbox.values()]
        .filter((e) => !householdId || e.householdId === householdId)
        .sort((a, b) => a.seq - b.seq)
        .map(clone);
    },
    async pendingFor(entity, id) {
      const hit = [...outbox.values()]
        .filter((e) => e.entity === entity && e.entityId === id && e.status === "pending")
        .sort((a, b) => a.seq - b.seq)
        .pop();
      return clone(hit ?? null);
    },
    async updateOutbox(opId, patch) {
      const existing = outbox.get(opId);
      if (existing) outbox.set(opId, { ...existing, ...patch });
    },
    async removeOutbox(opIds) {
      for (const id of opIds) outbox.delete(id);
    },

    async getMeta(key) {
      return meta.get(key) ?? null;
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
  };
}
