import type { LocalStore } from "./interface";
import type { LocalRow, OutboxEntry, SyncEntity } from "../types";

/**
 * The minimum a SQL driver has to provide.
 *
 * Matches the shape of expo-sqlite's async API, and is also satisfied by
 * node:sqlite in a couple of lines — which is how this adapter's SQL is
 * actually tested, rather than mocked. Same code backs the phone.
 */
export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Rows are stored as JSON in a `data` column rather than as typed columns.
 *
 * The local mirror does not need to query by arbitrary field — the app reads by
 * household and by id, and every report is computed from the rows it already
 * pulled. Storing JSON means a schema change on the server does not require a
 * migration on every phone, which matters when an old app version can stay
 * installed for months.
 */
export const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS rows (
  entity       TEXT NOT NULL,
  id           TEXT NOT NULL,
  household_id TEXT NOT NULL,
  revision     TEXT NOT NULL,
  deleted_at   TEXT,
  data         TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE INDEX IF NOT EXISTS rows_household ON rows (entity, household_id);

CREATE TABLE IF NOT EXISTS outbox (
  op_id           TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  op              TEXT NOT NULL,
  base_revision   TEXT,
  payload         TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS outbox_ready ON outbox (household_id, status, next_attempt_at, seq);
CREATE INDEX IF NOT EXISTS outbox_row ON outbox (entity, entity_id, status);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const toRow = (r: any): LocalRow => JSON.parse(r.data);

const toEntry = (r: any): OutboxEntry => ({
  opId: r.op_id,
  householdId: r.household_id,
  entity: r.entity,
  entityId: r.entity_id,
  op: r.op,
  baseRevision: r.base_revision ?? null,
  payload: JSON.parse(r.payload),
  seq: Number(r.seq),
  attempts: Number(r.attempts),
  nextAttemptAt: Number(r.next_attempt_at),
  status: r.status,
  lastError: r.last_error ?? null,
});

export async function createSqlStore(driver: SqlDriver): Promise<LocalStore> {
  for (const statement of SQL_SCHEMA.split(";")) {
    if (statement.trim()) await driver.execute(statement);
  }

  // Defined up front rather than as a method so putMany can call it without
  // depending on `this` binding through the returned object literal.
  const put = async (entity: SyncEntity, row: LocalRow) => {
    await driver.execute(
      `INSERT INTO rows (entity, id, household_id, revision, deleted_at, data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity, id) DO UPDATE SET
         household_id = excluded.household_id, revision = excluded.revision,
         deleted_at = excluded.deleted_at, data = excluded.data`,
      [entity, row.id, row.householdId, String(row.revision), row.deletedAt ?? null,
       JSON.stringify(row)],
    );
  };

  return {
    async get(entity, id) {
      const [row] = await driver.select("SELECT data FROM rows WHERE entity = ? AND id = ?", [entity, id]);
      return row ? toRow(row) : null;
    },
    async list(entity, householdId, opts) {
      const rows = await driver.select(
        opts?.includeDeleted
          ? "SELECT data FROM rows WHERE entity = ? AND household_id = ?"
          : "SELECT data FROM rows WHERE entity = ? AND household_id = ? AND deleted_at IS NULL",
        [entity, householdId],
      );
      return rows.map(toRow);
    },
    put,
    async putMany(entity, rows) {
      for (const row of rows) await put(entity, row);
    },
    async hardDelete(entity, id) {
      await driver.execute("DELETE FROM rows WHERE entity = ? AND id = ?", [entity, id]);
    },

    async enqueue(entry) {
      const [{ next }] = await driver.select<{ next: number }>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM outbox",
      );
      const seq = Number(next);
      await driver.execute(
        `INSERT INTO outbox (op_id, household_id, entity, entity_id, op, base_revision,
                             payload, seq, attempts, next_attempt_at, status, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.opId, entry.householdId, entry.entity, entry.entityId, entry.op,
         entry.baseRevision, JSON.stringify(entry.payload), seq, entry.attempts,
         entry.nextAttemptAt, entry.status, entry.lastError],
      );
      return { ...entry, seq } as OutboxEntry;
    },
    async dueOutbox(householdId, now, limit = 100) {
      const rows = await driver.select(
        `SELECT * FROM outbox
          WHERE household_id = ? AND status = 'pending' AND next_attempt_at <= ?
          ORDER BY seq ASC LIMIT ?`,
        [householdId, now, limit],
      );
      return rows.map(toEntry);
    },
    async allOutbox(householdId) {
      const rows = householdId
        ? await driver.select("SELECT * FROM outbox WHERE household_id = ? ORDER BY seq", [householdId])
        : await driver.select("SELECT * FROM outbox ORDER BY seq");
      return rows.map(toEntry);
    },
    async pendingFor(entity, id) {
      const rows = await driver.select(
        `SELECT * FROM outbox WHERE entity = ? AND entity_id = ? AND status = 'pending'
          ORDER BY seq DESC LIMIT 1`,
        [entity, id],
      );
      return rows.length ? toEntry(rows[0]) : null;
    },
    async updateOutbox(opId, patch) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.attempts !== undefined) { sets.push("attempts = ?"); params.push(patch.attempts); }
      if (patch.nextAttemptAt !== undefined) { sets.push("next_attempt_at = ?"); params.push(patch.nextAttemptAt); }
      if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status); }
      if (patch.lastError !== undefined) { sets.push("last_error = ?"); params.push(patch.lastError); }
      if (patch.payload !== undefined) { sets.push("payload = ?"); params.push(JSON.stringify(patch.payload)); }
      if (patch.op !== undefined) { sets.push("op = ?"); params.push(patch.op); }
      if (sets.length === 0) return;
      params.push(opId);
      await driver.execute(`UPDATE outbox SET ${sets.join(", ")} WHERE op_id = ?`, params);
    },
    async removeOutbox(opIds) {
      for (const id of opIds) {
        await driver.execute("DELETE FROM outbox WHERE op_id = ?", [id]);
      }
    },

    async getMeta(key) {
      const [row] = await driver.select<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
      return row ? row.value : null;
    },
    async setMeta(key, value) {
      await driver.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
  };
}
