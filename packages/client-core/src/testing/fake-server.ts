import type { ChangesPage, PushOp, PushResult, SyncEntity, SyncTransport } from "../types";

/**
 * An in-memory stand-in for the sync API.
 *
 * It implements the same rules as the real server (docs/SYNC.md): the server
 * assigns revisions, pushes are idempotent by opId, a delete beats a concurrent
 * edit, and a stale baseRevision produces a conflict. That makes it possible to
 * test convergence — two devices, offline edits, reconnect — as a fast unit
 * test instead of standing up Postgres and Nest for every case.
 *
 * Shipped rather than confined to the test folder because the mobile app can
 * develop screens against it with no backend running at all.
 */
export interface FakeServerRow {
  id: string;
  householdId: string;
  revision: string;
  deletedAt: string | null;
  [field: string]: unknown;
}

export function createFakeServer(householdId = "h1") {
  const rows = new Map<string, Map<string, FakeServerRow>>();
  const ledger = new Map<string, string>(); // opId -> revision
  const conflicts: { entity: string; entityId: string; losingPayload: unknown }[] = [];
  let revision = 0n;

  const table = (entity: SyncEntity) => {
    let t = rows.get(entity);
    if (!t) rows.set(entity, (t = new Map()));
    return t;
  };

  function push(_deviceId: string, ops: PushOp[]): PushResult {
    const applied: PushResult["applied"] = [];
    const conflicted: PushResult["conflicts"] = [];

    for (const op of ops) {
      const seen = ledger.get(op.opId);
      if (seen) {
        applied.push({ opId: op.opId, id: op.id, revision: seen });
        continue;
      }

      const t = table(op.entity);
      const existing = t.get(op.id);

      // A delete beats a concurrent edit.
      if (existing?.deletedAt && op.op === "upsert") {
        conflicts.push({ entity: op.entity, entityId: op.id, losingPayload: op.payload });
        conflicted.push({ opId: op.opId, id: op.id, entity: op.entity, reason: "deleted elsewhere" });
        continue;
      }

      if (existing && op.baseRevision != null && BigInt(existing.revision) > BigInt(op.baseRevision)) {
        // Later arrival wins; the overwritten value is preserved.
        conflicts.push({ entity: op.entity, entityId: op.id, losingPayload: { ...existing } });
        conflicted.push({ opId: op.opId, id: op.id, entity: op.entity, reason: "edited elsewhere" });
      }

      revision += 1n;
      const next: FakeServerRow = {
        ...(existing ?? {}),
        ...(op.op === "delete" ? {} : (op.payload ?? {})),
        id: op.id,
        householdId,
        revision: String(revision),
        deletedAt: op.op === "delete" ? new Date().toISOString() : existing?.deletedAt ?? null,
      };
      t.set(op.id, next);
      ledger.set(op.opId, String(revision));
      applied.push({ opId: op.opId, id: op.id, revision: String(revision) });
    }

    return { applied, conflicts: conflicted, newRevision: String(revision) };
  }

  function changes(cursor: string, limit = 500): ChangesPage {
    const [rev = "0", lastId = ""] = cursor.split(":");
    const all = [...rows.entries()].flatMap(([entity, t]) =>
      [...t.values()].map((r) => ({ ...r, entity: entity as SyncEntity })),
    );
    const after = all
      .filter((r) => {
        const c = BigInt(r.revision) - BigInt(rev || "0");
        return c > 0n || (c === 0n && r.id > lastId);
      })
      .sort((a, b) => {
        const d = BigInt(a.revision) - BigInt(b.revision);
        return d !== 0n ? (d < 0n ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

    const page = after.slice(0, limit);
    const last = page[page.length - 1];
    return {
      changes: page as ChangesPage["changes"],
      nextCursor: last ? `${last.revision}:${last.id}` : cursor,
      hasMore: after.length > limit,
    };
  }

  const transport: SyncTransport = {
    async changes(cursor, limit) { return changes(cursor, limit); },
    async push(deviceId, ops) { return push(deviceId, ops); },
  };

  return {
    transport,
    conflicts,
    /** Direct access, for asserting what the server really holds. */
    row: (entity: SyncEntity, id: string) => table(entity).get(id) ?? null,
    all: (entity: SyncEntity) => [...table(entity).values()],
    revision: () => String(revision),
    /** Simulate another device writing straight to the server. */
    seed(entity: SyncEntity, row: { id: string } & Record<string, unknown>) {
      revision += 1n;
      table(entity).set(row.id, {
        ...row, householdId, revision: String(revision), deletedAt: null,
      } as FakeServerRow);
    },
  };
}

/**
 * Wrap a transport so it fails the way a real network does.
 *
 * `failEvery` makes every Nth call throw; `duplicate` makes push apply twice
 * server-side while the client only sees one response, which is exactly what a
 * response lost in transit looks like from the client's side.
 */
export function flaky(
  inner: SyncTransport,
  opts: { failEvery?: number; duplicate?: boolean; error?: () => Error } = {},
): SyncTransport {
  let calls = 0;
  const boom = opts.error ?? (() => new Error("network unreachable"));
  return {
    async changes(cursor, limit) {
      if (opts.failEvery && ++calls % opts.failEvery === 0) throw boom();
      return inner.changes(cursor, limit);
    },
    async push(deviceId, ops) {
      if (opts.failEvery && ++calls % opts.failEvery === 0) {
        if (opts.duplicate) await inner.push(deviceId, ops); // applied, response lost
        throw boom();
      }
      return inner.push(deviceId, ops);
    },
  };
}
