import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, rawPrisma } from "./client";
import { clearKeyCache, decryptField, encryptField, isEncrypted, masterKey } from "./crypto";

// These run against a real Postgres: the whole point is what actually lands on
// disk, which a mocked client cannot tell us.

let householdId: string;
let accountId: string;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  clearKeyCache();
  await rawPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Transaction", "Account", "Category", "HouseholdKey",
      "Membership", "Household", "User" RESTART IDENTITY CASCADE
  `);
  const household = await rawPrisma.household.create({
    data: { name: "Test", baseCurrency: "USD" },
  });
  householdId = household.id;
  const account = await rawPrisma.account.create({
    data: { householdId, name: "Cash", type: "CASH", currency: "USD" },
  });
  accountId = account.id;
});

const txn = (over: Record<string, unknown> = {}) => ({
  householdId, accountId, type: "EXPENSE", amount: 12.5,
  currency: "USD", date: new Date("2026-08-12"), ...over,
});

/** What is really stored, read straight past the extension. */
async function onDisk(id: string) {
  const [row] = await rawPrisma.$queryRawUnsafe<any[]>(
    `SELECT description, notes, "rawSms" FROM "Transaction" WHERE id = $1`, id,
  );
  return row;
}

describe("field encryption", () => {
  it("round-trips a description", async () => {
    const created = await prisma.transaction.create({
      data: txn({ description: "Dinner with Sara" }),
    });
    expect(created.description).toBe("Dinner with Sara");

    const read = await prisma.transaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(read.description).toBe("Dinner with Sara");
  });

  // The exit criterion: a raw SELECT must not show the text.
  it("stores ciphertext on disk, not the text", async () => {
    const created = await prisma.transaction.create({
      data: txn({ description: "Dinner with Sara", notes: "split the bill", rawSms: "BANK: 12.50" }),
    });
    const stored = await onDisk(created.id);
    for (const [field, value] of Object.entries(stored)) {
      expect(isEncrypted(value), `${field} was stored in the clear`).toBe(true);
    }
    expect(JSON.stringify(stored)).not.toContain("Sara");
    expect(JSON.stringify(stored)).not.toContain("split the bill");
  });

  it("leaves amounts and dates queryable", async () => {
    await prisma.transaction.create({ data: txn({ description: "a", amount: 10 }) });
    await prisma.transaction.create({ data: txn({ description: "b", amount: 20 }) });
    // The whole reason amounts are not encrypted (D3): this has to work in SQL.
    const total = await rawPrisma.transaction.aggregate({
      where: { householdId }, _sum: { amount: true },
    });
    expect(Number(total._sum.amount)).toBe(30);
  });

  it("encrypts on update too", async () => {
    const created = await prisma.transaction.create({ data: txn({ description: "before" }) });
    await prisma.transaction.update({
      where: { id: created.id }, data: { description: "after" },
    });
    expect(isEncrypted((await onDisk(created.id)).description)).toBe(true);
    const read = await prisma.transaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(read.description).toBe("after");
  });

  it("encrypts every row of a createMany (the CSV importer's path)", async () => {
    await prisma.transaction.createMany({
      data: [txn({ description: "one" }), txn({ description: "two" })],
    });
    const rows = await prisma.transaction.findMany({ where: { householdId } });
    expect(rows.map((r) => r.description).sort()).toEqual(["one", "two"]);
    for (const r of rows) {
      expect(isEncrypted((await onDisk(r.id)).description)).toBe(true);
    }
  });

  // Rows written before encryption existed must stay readable, or switching it
  // on would blank out every existing description until a backfill ran.
  it("passes through plaintext written before encryption existed", async () => {
    const legacy = await rawPrisma.transaction.create({
      data: txn({ description: "written before encryption" }),
    });
    const read = await prisma.transaction.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(read.description).toBe("written before encryption");
  });

  it("never double-encrypts", async () => {
    const once = await encryptField(householdId, "secret");
    expect(await encryptField(householdId, once)).toBe(once);
  });

  it("decrypts through a nested include", async () => {
    await prisma.transaction.create({ data: txn({ description: "nested" }) });
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { transactions: true },
    });
    expect(account.transactions[0].description).toBe("nested");
  });

  it("leaves null and undefined alone", async () => {
    const created = await prisma.transaction.create({ data: txn({ description: null }) });
    expect(created.description).toBeNull();
    expect((await onDisk(created.id)).description).toBeNull();
  });

  // A wrong key must fail loudly. Silently returning blanks would let a user
  // save over real data with nothing.
  it("throws rather than returning a blank field for a wrong key", async () => {
    const created = await prisma.transaction.create({ data: txn({ description: "sensitive" }) });
    const stored = (await onDisk(created.id)).description as string;

    clearKeyCache();
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    await expect(decryptField(stored)).rejects.toThrow(/Could not decrypt/);
    process.env.TOKEN_ENCRYPTION_KEY = original;
    clearKeyCache();
  });

  it("gives each household its own data key", async () => {
    const other = await rawPrisma.household.create({ data: { name: "Other", baseCurrency: "USD" } });
    await encryptField(householdId, "x");
    await encryptField(other.id, "y");
    const keys = await rawPrisma.householdKey.findMany();
    expect(keys.length).toBe(2);
    expect(keys[0].wrappedDek).not.toBe(keys[1].wrappedDek);
  });

  it("requires a 32-byte master key", () => {
    expect(() => masterKey("dG9vLXNob3J0")).toThrow(/32 bytes/);
  });
});

describe("no client bypasses encryption", () => {
  it("constructs PrismaClient in exactly one place", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        // Skip tests — this file names the pattern it is looking for.
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)
                 && readFileSync(full, "utf8").includes("new PrismaClient")) {
          hits.push(full);
        }
      }
    };
    walk(join(process.cwd(), "..", ".."));
    // Any other construction silently skips the extension and writes narrative
    // fields to disk in the clear — which is precisely how the demo seed
    // shipped unencrypted data.
    expect(hits.map((h) => h.split("/financemanager-web/")[1] ?? h))
      .toEqual(["packages/db/src/client.ts"]);
  });
});
