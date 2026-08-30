import { describe, expect, it, beforeEach } from "vitest";
import { createMemoryStore } from "./memory";
import { createSqlStore, type SqlDriver } from "./sql";
import type { LocalStore } from "./interface";
import type { LocalRow, OutboxEntry } from "../types";

/**
 * node:sqlite as a SqlDriver. The point is that the adapter's SQL runs against
 * a real engine rather than a mock — the same statements will run on
 * expo-sqlite on the phone, where a typo would only show up on a device.
 */
// Reached through process.getBuiltinModule rather than an import: this Vite
// version predates node:sqlite and resolves it to a bare "sqlite" that does not
// exist, and it intercepts dynamic import too. This bypasses resolution
// entirely.
function nodeSqliteDriver(): SqlDriver {
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(":memory:");
  return {
    async execute(sql, params = []) {
      db.prepare(sql).run(...(params as any[]));
    },
    async select<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as any[])) as T[];
    },
  };
}

const row = (over: Partial<LocalRow> = {}): LocalRow => ({
  id: "r1", householdId: "h1", revision: "1", deletedAt: null,
  description: "Coffee", amount: 3, ...over,
});

const entry = (over: Partial<OutboxEntry> = {}): Omit<OutboxEntry, "seq"> => ({
  opId: "op1", householdId: "h1", entity: "transaction", entityId: "r1",
  op: "upsert", baseRevision: null, payload: { amount: 3 },
  attempts: 0, nextAttemptAt: 0, status: "pending", lastError: null, ...over,
});

// The same suite against both adapters: the in-memory one is the reference,
// and the SQL one has to behave identically or the phone diverges from tests.
const adapters: [string, () => Promise<LocalStore>][] = [
  ["memory", async () => createMemoryStore()],
  ["sqlite", async () => createSqlStore(nodeSqliteDriver())],
];

describe.each(adapters)("LocalStore (%s)", (_name, make) => {
  let store: LocalStore;
  beforeEach(async () => { store = await make(); });

  it("round-trips a row", async () => {
    await store.put("transaction", row());
    expect(await store.get("transaction", "r1")).toMatchObject({ id: "r1", description: "Coffee" });
  });

  it("upserts rather than duplicating", async () => {
    await store.put("transaction", row());
    await store.put("transaction", row({ description: "Tea" }));
    const all = await store.list("transaction", "h1");
    expect(all).toHaveLength(1);
    expect(all[0].description).toBe("Tea");
  });

  it("scopes list by household", async () => {
    await store.put("transaction", row());
    await store.put("transaction", row({ id: "r2", householdId: "h2" }));
    expect(await store.list("transaction", "h1")).toHaveLength(1);
  });

  it("hides tombstones from list unless asked", async () => {
    await store.put("transaction", row({ deletedAt: "2026-08-12T00:00:00.000Z" }));
    expect(await store.list("transaction", "h1")).toHaveLength(0);
    expect(await store.list("transaction", "h1", { includeDeleted: true })).toHaveLength(1);
  });

  it("keeps entities separate", async () => {
    await store.put("transaction", row());
    await store.put("account", row());
    expect(await store.list("account", "h1")).toHaveLength(1);
    expect(await store.list("transaction", "h1")).toHaveLength(1);
  });

  it("returns null for a missing row", async () => {
    expect(await store.get("transaction", "nope")).toBeNull();
  });

  // FIFO is what keeps a create ahead of the edit that follows it.
  it("preserves outbox order by seq", async () => {
    await store.enqueue(entry({ opId: "a" }));
    await store.enqueue(entry({ opId: "b", entityId: "r2" }));
    await store.enqueue(entry({ opId: "c", entityId: "r3" }));
    expect((await store.allOutbox("h1")).map((e) => e.opId)).toEqual(["a", "b", "c"]);
  });

  it("only returns entries that are due", async () => {
    await store.enqueue(entry({ opId: "soon", nextAttemptAt: 0 }));
    await store.enqueue(entry({ opId: "later", entityId: "r2", nextAttemptAt: 10_000 }));
    expect((await store.dueOutbox("h1", 5_000)).map((e) => e.opId)).toEqual(["soon"]);
  });

  it("excludes quarantined entries from due work", async () => {
    await store.enqueue(entry({ opId: "bad", status: "quarantined" }));
    expect(await store.dueOutbox("h1", 1_000)).toHaveLength(0);
    expect(await store.allOutbox("h1")).toHaveLength(1);
  });

  it("finds the pending entry for a row", async () => {
    await store.enqueue(entry({ opId: "a" }));
    expect((await store.pendingFor("transaction", "r1"))?.opId).toBe("a");
    expect(await store.pendingFor("transaction", "other")).toBeNull();
  });

  it("patches an entry, including its payload", async () => {
    await store.enqueue(entry({ opId: "a" }));
    await store.updateOutbox("a", { attempts: 3, status: "quarantined", payload: { amount: 9 } });
    const [after] = await store.allOutbox("h1");
    expect(after.attempts).toBe(3);
    expect(after.status).toBe("quarantined");
    expect(after.payload).toEqual({ amount: 9 });
  });

  it("removes entries", async () => {
    await store.enqueue(entry({ opId: "a" }));
    await store.enqueue(entry({ opId: "b", entityId: "r2" }));
    await store.removeOutbox(["a"]);
    expect((await store.allOutbox("h1")).map((e) => e.opId)).toEqual(["b"]);
  });

  it("stores metadata", async () => {
    expect(await store.getMeta("cursor:h1")).toBeNull();
    await store.setMeta("cursor:h1", "42:abc");
    await store.setMeta("cursor:h1", "43:def");
    expect(await store.getMeta("cursor:h1")).toBe("43:def");
  });

  // A store handing out live references would let a caller mutate the database
  // by accident, and the two adapters would then disagree.
  it("does not hand out references into its own storage", async () => {
    const original = row();
    await store.put("transaction", original);
    original.description = "mutated after put";
    expect((await store.get("transaction", "r1"))?.description).toBe("Coffee");

    const fetched = (await store.get("transaction", "r1"))!;
    fetched.description = "mutated after get";
    expect((await store.get("transaction", "r1"))?.description).toBe("Coffee");
  });
});
