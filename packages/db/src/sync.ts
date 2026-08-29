import { Prisma } from "@prisma/client";
import { prisma, rawPrisma } from "./client";

// ---------------------------------------------------------------------------
// The sync protocol, server side (ARCHITECTURE.md §4 and §6).
//
// Three properties this file exists to guarantee:
//
//  1. The SERVER assigns order. Device clocks are wrong — phones cross time
//     zones and users change the date — so ordering comes from
//     Household.syncRevision and nothing else.
//  2. Every push is IDEMPOTENT. A batch retried after a network timeout must
//     apply once; the SyncOperation ledger is what makes that true.
//  3. Nothing is silently discarded. A write that loses a conflict is kept in
//     SyncConflict and shown to the user. This is a ledger; a figure somebody
//     typed does not just vanish.
// ---------------------------------------------------------------------------

/**
 * Entity registry. `order` is the FK dependency order: an account must exist
 * before a transaction can reference it, so a batch containing both is applied
 * in this order regardless of how the client listed them.
 */
export const SYNC_ENTITIES = [
  { name: "account", model: "account", order: 1,
    writable: ["name", "type", "currency", "openingBalance", "isArchived"] },
  { name: "category", model: "category", order: 1,
    writable: ["name", "type", "color", "icon", "isArchived", "parentId"] },
  { name: "transaction", model: "transaction", order: 2,
    writable: ["accountId", "categoryId", "transferAccountId", "type", "amount",
               "currency", "date", "description", "notes", "origin", "smsHash",
               "smsConfidence", "needsReview", "pending"] },
  { name: "budget", model: "budget", order: 3,
    writable: ["categoryId", "amount", "currency", "period", "startDate"] },
  { name: "investment", model: "investment", order: 3,
    writable: ["accountId", "symbol", "name", "type", "quantity", "costBasis",
               "currentPrice", "currency", "purchaseDate"] },
] as const;

export type SyncEntityName = (typeof SYNC_ENTITIES)[number]["name"];

const BY_NAME = new Map(SYNC_ENTITIES.map((e) => [e.name, e]));

// Fields a client may never set. householdId in particular: scoping comes from
// the caller's verified membership, never from the payload.
const NEVER_WRITABLE = new Set([
  "id", "householdId", "revision", "createdAt", "updatedAt", "deletedAt",
  "createdById", "plaidTransactionId", "seedKey",
]);

export interface Cursor {
  revision: bigint;
  id: string;
}

/** "<revision>:<id>" — or just "<revision>" / "0" from a fresh client. */
export function parseCursor(raw: string | undefined | null): Cursor {
  if (!raw) return { revision: 0n, id: "" };
  const [rev, id = ""] = String(raw).split(":");
  let revision: bigint;
  try {
    revision = BigInt(rev);
  } catch {
    revision = 0n;
  }
  return { revision: revision < 0n ? 0n : revision, id };
}

export function formatCursor(c: Cursor): string {
  return `${c.revision}:${c.id}`;
}

export interface ChangeRow {
  entity: SyncEntityName;
  id: string;
  revision: string;
  deletedAt: string | null;
  [field: string]: unknown;
}

/**
 * Everything in this household that changed after `cursor`.
 *
 * Ordered by (revision, id). The id tiebreak matters: rows seeded when a
 * household is created all share one revision, so ordering by revision alone
 * would let a page boundary fall inside that group and silently skip whatever
 * came after it in the page.
 *
 * Tombstones are INCLUDED — a delete is a change a device has to learn about.
 */
export async function pullChanges(
  householdId: string,
  cursor: Cursor,
  limit = 500,
): Promise<{ changes: ChangeRow[]; nextCursor: string; hasMore: boolean }> {
  const take = Math.min(Math.max(limit, 1), 1000);

  const perEntity = await Promise.all(
    SYNC_ENTITIES.map(async (entity) => {
      // Raw, because the cursor needs a ROW comparison — (revision, id) > (r, i)
      // — and Prisma can only express it as `revision > r OR (revision = r AND
      // id > i)`. Postgres answers that OR with a bitmap scan and a full sort;
      // the row comparison against the (householdId, revision, id) index is a
      // plain Index Only Scan. Measured on 20k rows: 1.24 ms and 32 buffers
      // versus 0.20 ms and 5. This is the hot path for every device on every
      // wake, so it is worth the raw query.
      const table = entity.model[0].toUpperCase() + entity.model.slice(1);
      const keys = await rawPrisma.$queryRawUnsafe<{ id: string; revision: bigint }[]>(
        `SELECT id, revision FROM "${table}"
          WHERE "householdId" = $1 AND (revision, id) > ($2, $3)
          ORDER BY revision ASC, id ASC
          LIMIT $4`,
        householdId, cursor.revision, cursor.id, take + 1,
      );
      if (keys.length === 0) return [];

      // Fetched through the extended client on purpose: narrative fields are
      // encrypted at rest, and a raw row would hand the device ciphertext.
      const rows: any[] = await (prisma as any)[entity.model].findMany({
        where: { id: { in: keys.map((k) => k.id) } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return keys
        .map((k) => byId.get(k.id))
        .filter(Boolean)
        .map((row) => ({ ...row, entity: entity.name }));
    }),
  );

  const merged = perEntity
    .flat()
    .sort((a, b) =>
      a.revision === b.revision
        ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        : a.revision < b.revision ? -1 : 1,
    );

  const page = merged.slice(0, take);
  const hasMore = merged.length > take;
  const last = page[page.length - 1];

  return {
    changes: page.map((row) => ({
      ...row,
      revision: String(row.revision),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    })) as ChangeRow[],
    nextCursor: last
      ? formatCursor({ revision: last.revision, id: last.id })
      : formatCursor(cursor),
    hasMore,
  };
}

export interface PushOp {
  opId: string;
  entity: SyncEntityName;
  id: string;
  op: "upsert" | "delete";
  /** Revision the client believed it was editing. Absent for a create. */
  baseRevision?: string | null;
  payload?: Record<string, unknown>;
}

export interface PushResult {
  applied: { opId: string; id: string; revision: string }[];
  conflicts: { opId: string; id: string; entity: string; reason: string }[];
  newRevision: string;
}

/** Strip anything the client may not set, and keep only known columns. */
function sanitise(entity: (typeof SYNC_ENTITIES)[number], payload: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const key of entity.writable) {
    if (key in payload && !NEVER_WRITABLE.has(key)) out[key] = payload[key];
  }
  return out;
}

/**
 * Apply a batch of client mutations.
 *
 * The whole batch is one transaction: a batch that half-applies would leave a
 * transaction pointing at an account that never landed. Ops are sorted into FK
 * dependency order first, so a client listing them in any order still works.
 */
export async function pushOps(
  householdId: string,
  deviceId: string,
  ops: PushOp[],
): Promise<PushResult> {
  const applied: PushResult["applied"] = [];
  const conflicts: PushResult["conflicts"] = [];

  const ordered = [...ops].sort(
    (a, b) => (BY_NAME.get(a.entity)?.order ?? 99) - (BY_NAME.get(b.entity)?.order ?? 99),
  );

  await prisma.$transaction(async (tx) => {
    for (const op of ordered) {
      const entity = BY_NAME.get(op.entity);
      if (!entity) throw new Error(`Unknown sync entity "${op.entity}"`);
      const delegate = (tx as any)[entity.model];

      // Idempotency. A retried batch must not apply twice, so the ledger is
      // consulted before anything else.
      const seen = await (tx as any).syncOperation.findUnique({ where: { opId: op.opId } });
      if (seen) {
        applied.push({ opId: op.opId, id: op.id, revision: String(seen.appliedRevision) });
        continue;
      }

      const existing = await delegate.findFirst({ where: { id: op.id, householdId } });
      const base = op.baseRevision != null ? BigInt(op.baseRevision) : null;

      // A delete always beats a concurrent edit. Resurrecting a row somebody
      // deliberately deleted is worse than losing an edit to it.
      if (existing?.deletedAt && op.op === "upsert") {
        await recordConflict(tx, householdId, entity.name, op.id, op.payload ?? {},
          existing.revision);
        conflicts.push({ opId: op.opId, id: op.id, entity: entity.name,
          reason: "The row was deleted on another device" });
        continue;
      }

      const revision = await nextRevisionIn(tx, householdId);

      if (!existing) {
        // Creates never conflict: ids are client-generated, so two offline
        // creates are two genuinely different rows.
        await delegate.create({
          data: { ...sanitise(entity, op.payload), id: op.id, householdId, revision,
                  ...(op.op === "delete" ? { deletedAt: new Date() } : {}) },
        });
      } else {
        if (base != null && existing.revision > base) {
          // The incoming write is the later arrival and takes the row; what it
          // overwrote is preserved so the user can review and restore it.
          await recordConflict(tx, householdId, entity.name, op.id,
            stripForConflict(existing), existing.revision);
          conflicts.push({ opId: op.opId, id: op.id, entity: entity.name,
            reason: "Edited on another device; the previous value was kept for review" });
        }
        await delegate.update({
          where: { id: op.id },
          data: op.op === "delete"
            ? { deletedAt: new Date(), revision }
            : { ...sanitise(entity, op.payload), revision, deletedAt: null },
        });
      }

      await (tx as any).syncOperation.create({
        data: { opId: op.opId, deviceId, householdId, entity: entity.name,
                entityId: op.id, appliedRevision: revision },
      });
      applied.push({ opId: op.opId, id: op.id, revision: String(revision) });
    }
  });

  const household = await rawPrisma.household.findUniqueOrThrow({
    where: { id: householdId }, select: { syncRevision: true },
  });
  return { applied, conflicts, newRevision: String(household.syncRevision) };
}

function stripForConflict(row: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (NEVER_WRITABLE.has(k) && k !== "id") continue;
    out[k] = v instanceof Date ? v.toISOString()
      : typeof v === "bigint" ? String(v)
      : v instanceof Prisma.Decimal ? v.toString()
      : v;
  }
  return out;
}

async function recordConflict(
  tx: any, householdId: string, entity: string, entityId: string,
  losingPayload: Record<string, unknown>, winningRevision: bigint,
) {
  await tx.syncConflict.create({
    data: { householdId, entity, entityId, losingPayload: losingPayload as any, winningRevision },
  });
}

/** Allocate a revision inside an open transaction. */
async function nextRevisionIn(tx: any, householdId: string): Promise<bigint> {
  const [row] = await tx.$queryRaw<{ syncRevision: bigint }[]>`
    UPDATE "Household" SET "syncRevision" = "syncRevision" + 1
     WHERE id = ${householdId} RETURNING "syncRevision"
  `;
  if (!row) throw new Error(`unknown household ${householdId}`);
  return row.syncRevision;
}

/** Record how far a device has read, so tombstones can eventually be swept. */
export async function saveCursor(deviceId: string, householdId: string, cursor: Cursor) {
  await rawPrisma.syncCursor.upsert({
    where: { deviceId_householdId: { deviceId, householdId } },
    create: { deviceId, householdId, lastRevision: cursor.revision },
    update: { lastRevision: cursor.revision, lastSyncedAt: new Date() },
  });
}

export async function listConflicts(householdId: string, includeResolved = false) {
  const rows = await rawPrisma.syncConflict.findMany({
    where: { householdId, ...(includeResolved ? {} : { resolvedAt: null }) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({ ...r, winningRevision: String(r.winningRevision) }));
}

export async function resolveConflict(householdId: string, id: string): Promise<boolean> {
  const { count } = await rawPrisma.syncConflict.updateMany({
    where: { id, householdId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return count > 0;
}

/**
 * Hard-delete tombstones every device has already seen.
 *
 * A tombstone can only go once no cursor could still need it — otherwise a
 * device that has been offline for a month comes back, never learns the row was
 * deleted, and re-creates it from its own copy. Households with no registered
 * device are skipped entirely rather than swept eagerly.
 */
export async function sweepTombstones(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  let removed = 0;

  for (const household of await rawPrisma.household.findMany({ select: { id: true } })) {
    const cursors = await rawPrisma.syncCursor.findMany({
      where: { householdId: household.id },
      select: { lastRevision: true },
    });
    if (cursors.length === 0) continue;

    const safeBelow = cursors.reduce(
      (min, c) => (c.lastRevision < min ? c.lastRevision : min),
      cursors[0].lastRevision,
    );

    for (const entity of SYNC_ENTITIES) {
      const { count } = await (rawPrisma as any)[entity.model].deleteMany({
        where: {
          householdId: household.id,
          deletedAt: { not: null, lt: cutoff },
          revision: { lte: safeBelow },
        },
      });
      removed += count;
    }
  }
  return removed;
}
