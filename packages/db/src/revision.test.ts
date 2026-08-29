import { beforeEach, describe, expect, it } from "vitest";
import { prisma, rawPrisma } from "./client";

// The gap this closes: the web app's Server Actions never stamped a revision,
// so anything created in the browser stayed at 0 — and a device's first pull
// asks for `revision > 0`, which would have made those rows invisible to sync
// forever. These writes go through the same client the Server Actions use.

let householdId: string;
let accountId: string;

beforeEach(async () => {
  process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString("base64");
  await rawPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Transaction", "Account", "Category", "HouseholdKey",
      "Membership", "Household", "User" RESTART IDENTITY CASCADE
  `);
  const h = await rawPrisma.household.create({ data: { name: "R", baseCurrency: "USD" } });
  householdId = h.id;
  accountId = (await prisma.account.create({
    data: { householdId, name: "Cash", type: "CASH", currency: "USD" },
  })).id;
});

const txn = (over = {}) => ({
  householdId, accountId, type: "EXPENSE", amount: 1, currency: "USD",
  date: new Date(), ...over,
});

describe("revision stamping", () => {
  it("stamps a create", async () => {
    const row = await prisma.transaction.create({ data: txn() });
    expect(row.revision).toBeGreaterThan(0n);
  });

  it("stamps every row of a createMany", async () => {
    await prisma.transaction.createMany({ data: [txn(), txn(), txn()] });
    const rows = await prisma.transaction.findMany({ where: { householdId } });
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.revision).toBeGreaterThan(0n);
  });

  it("advances the revision on update, so the change is pulled again", async () => {
    const row = await prisma.transaction.create({ data: txn() });
    const updated = await prisma.transaction.update({
      where: { id: row.id }, data: { description: "changed" },
    });
    expect(updated.revision).toBeGreaterThan(row.revision);
  });

  it("advances the revision on a soft delete, so the tombstone propagates", async () => {
    const row = await prisma.transaction.create({ data: txn() });
    await prisma.transaction.update({
      where: { id: row.id }, data: { deletedAt: new Date() },
    });
    const after = await rawPrisma.transaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.revision).toBeGreaterThan(row.revision);
  });

  it("keeps Household.syncRevision at or above every row", async () => {
    await prisma.transaction.create({ data: txn() });
    await prisma.transaction.create({ data: txn() });
    const h = await rawPrisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const max = await rawPrisma.transaction.aggregate({
      where: { householdId }, _max: { revision: true },
    });
    expect(h.syncRevision).toBeGreaterThanOrEqual(max._max.revision!);
  });

  it("never reuses a revision within a household", async () => {
    await Promise.all(Array.from({ length: 10 }, () => prisma.transaction.create({ data: txn() })));
    const rows = await rawPrisma.transaction.findMany({ where: { householdId } });
    expect(new Set(rows.map((r) => String(r.revision))).size).toBe(rows.length);
  });

  it("respects a revision the caller set (the sync push assigns its own)", async () => {
    const row = await prisma.transaction.create({ data: { ...txn(), revision: 999n } });
    expect(row.revision).toBe(999n);
  });
});
