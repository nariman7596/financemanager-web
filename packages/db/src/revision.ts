import { prisma } from "./client";

/**
 * Allocate the next revision for a household.
 *
 * Household.syncRevision is the per-tenant total order sync pulls depend on
 * (ARCHITECTURE.md §4). Every write that a device must learn about has to take
 * a number from here, inside the same transaction as the write itself —
 * otherwise a row can exist with a revision no cursor will ever reach, and it
 * simply never syncs.
 *
 * The UPDATE ... RETURNING is atomic, so two concurrent writers cannot be
 * handed the same number.
 */
export async function nextRevision(householdId: string): Promise<bigint> {
  const [row] = await prisma.$queryRaw<{ syncRevision: bigint }[]>`
    UPDATE "Household"
       SET "syncRevision" = "syncRevision" + 1
     WHERE id = ${householdId}
    RETURNING "syncRevision"
  `;
  if (!row) throw new Error(`nextRevision: unknown household ${householdId}`);
  return row.syncRevision;
}
