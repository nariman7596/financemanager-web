import type { PrismaClient } from "@prisma/client";
import { decryptField, encryptField, isEncrypted } from "./crypto";

/**
 * Transparent field encryption (ARCHITECTURE.md D3).
 *
 * Which columns are covered, and why only these: they are free text a person
 * wrote or a bank sent, and nothing queries, sorts or aggregates them. Amounts,
 * dates and category ids stay in the clear because every report depends on
 * being able to SUM and GROUP BY them in SQL.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Transaction: ["description", "notes", "rawSms"],
  // A live bank credential — the one field that was already encrypted before
  // this existed, and the reason crypto.ts was written in the first place.
  PlaidItem: ["accessToken"],
};

const WRITE_OPS = new Set([
  "create", "createMany", "update", "updateMany", "upsert", "createManyAndReturn",
]);

/**
 * Decrypt every ciphertext string anywhere in a result.
 *
 * Deliberately structural rather than per-model: a ciphertext carries its own
 * household id, so it can be decrypted from itself. That means values reached
 * through a nested `include` — which a per-model hook never sees — are handled
 * too, and adding an encrypted column to a new model cannot silently return
 * ciphertext to a caller.
 */
async function decryptDeep(value: unknown): Promise<unknown> {
  if (isEncrypted(value)) return decryptField(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    return Promise.all(value.map(decryptDeep));
  }
  // Prisma Decimal and similar carry their own representation; walking into
  // them would rebuild them as plain objects and break `toNumber()`.
  if (value.constructor !== Object) return value;

  const out: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(value).map(async ([k, v]) => {
      out[k] = await decryptDeep(v);
    }),
  );
  return out;
}

export function withFieldEncryption(client: PrismaClient) {
  return client.$extends({
    name: "field-encryption",
    query: {
      async $allOperations({ model, operation, args, query }: any) {
        const fields = model ? ENCRYPTED_FIELDS[model] : undefined;

        if (fields && WRITE_OPS.has(operation) && args?.data) {
          args.data = Array.isArray(args.data)
            ? await Promise.all(
                args.data.map((row: any) => encryptRow(client, model, fields, row, args)),
              )
            : await encryptRow(client, model, fields, args.data, args);

          // upsert carries a second payload that the branch above misses.
          if (operation === "upsert" && args.create) {
            args.create = await encryptRow(client, model, fields, args.create, args);
          }
        }

        return decryptDeep(await query(args));
      },
    },
  });
}

async function encryptRow(
  client: PrismaClient,
  model: string,
  fields: string[],
  row: Record<string, any>,
  args: any,
): Promise<Record<string, any>> {
  const touched = fields.filter(
    (f) => typeof row?.[f] === "string" || typeof row?.[f]?.set === "string",
  );
  if (touched.length === 0) return row;

  const householdId = await resolveHousehold(client, model, row, args);
  const out = { ...row };
  for (const field of touched) {
    // Prisma allows `{ set: value }` as well as a bare value in updates.
    if (typeof out[field]?.set === "string") {
      out[field] = { set: await encryptField(householdId, out[field].set) };
    } else {
      out[field] = await encryptField(householdId, out[field]);
    }
  }
  return out;
}

/**
 * Which household's key encrypts this row.
 *
 * Creates carry householdId in the payload. Updates often do not, so the row is
 * looked up by the same `where` the update will use. Failing loudly when it
 * cannot be determined is deliberate: the alternative is writing somebody's
 * bank message to disk in plain text because a code path forgot to mention the
 * household.
 */
async function resolveHousehold(
  client: PrismaClient,
  model: string,
  row: Record<string, any>,
  args: any,
): Promise<string> {
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

  throw new Error(
    `Cannot encrypt ${model}: no householdId in the payload or reachable from the ` +
      "where clause. Include householdId so the right key is used.",
  );
}
