import type { PrismaClient } from "@prisma/client";
import { nextRevision } from "./revision";

/**
 * Stamp every write to a syncable model with a fresh revision.
 *
 * This is why it is an extension rather than a call at each site: the web app's
 * Server Actions never stamped one, so anything created in the browser stayed
 * at revision 0 — and a device's first pull asks for `revision > 0`, so those
 * rows would have been invisible to sync forever. Covering it here means the
 * two transports cannot disagree, and a new call site cannot forget.
 *
 * The number is allocated just before the write rather than inside its
 * transaction. A failed write therefore burns a revision, leaving a gap — which
 * is harmless, because cursors ask for `revision > n` and never assume the
 * numbers are contiguous.
 *
 * An explicit `revision` in the payload is respected: the sync push assigns its
 * own inside a batch transaction, and must not be overridden here.
 */
const SYNCABLE = new Set([
  "Account", "Category", "Transaction", "Budget", "Investment", "RecurringTransaction",
]);

const WRITE_OPS = new Set([
  "create", "createMany", "update", "updateMany", "upsert", "createManyAndReturn",
]);

export function withRevisionStamping(client: PrismaClient) {
  return client.$extends({
    name: "revision-stamping",
    query: {
      async $allOperations({ model, operation, args, query }: any) {
        if (!model || !SYNCABLE.has(model) || !WRITE_OPS.has(operation) || !args?.data) {
          return query(args);
        }

        const stamp = async (row: any) => {
          if (row == null || typeof row !== "object" || "revision" in row) return row;
          const householdId = await resolveHousehold(client, model, row, args);
          return householdId ? { ...row, revision: await nextRevision(householdId) } : row;
        };

        args.data = Array.isArray(args.data)
          ? await Promise.all(args.data.map(stamp))
          : await stamp(args.data);
        if (operation === "upsert" && args.create) args.create = await stamp(args.create);

        return query(args);
      },
    },
  });
}

/**
 * Best effort. Unlike encryption, a missing household is not fatal here: the
 * write still has to go through, and an unstamped row is a sync problem rather
 * than a data-loss one.
 */
async function resolveHousehold(
  client: PrismaClient,
  model: string,
  row: Record<string, any>,
  args: any,
): Promise<string | null> {
  if (typeof row.householdId === "string") return row.householdId;
  if (typeof args?.where?.householdId === "string") return args.where.householdId;
  if (args?.where) {
    const delegate = (client as any)[model[0].toLowerCase() + model.slice(1)];
    const found = await delegate.findFirst({
      where: args.where,
      select: { householdId: true },
    });
    if (found?.householdId) return found.householdId;
  }
  return null;
}
