import { prisma } from "@financemanager/db";
import { parseCsvObjects } from "@financemanager/core/csv";
import { TRANSACTION_TYPES, CURRENCY_CODES, type TransactionType } from "@financemanager/core/constants";

// Core CSV -> transactions import. No auth / no server-only here so it can be
// unit-tested directly; the Server Action wraps this with requireUser +
// revalidation.

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImportResult = {
  imported: number;
  skipped: number;
  createdAccounts: number;
  createdCategories: number;
  errors: { row: number; message: string }[];
  error?: string;
};

const emptyResult = (): ImportResult => ({
  imported: 0,
  skipped: 0,
  createdAccounts: 0,
  createdCategories: 0,
  errors: [],
});

export async function importTransactionsForHousehold(
  householdId: string,
  csvText: string,
  createdById?: string,
): Promise<ImportResult> {
  const rows = parseCsvObjects(csvText);
  if (rows.length === 0) return { ...emptyResult(), error: "No data rows found" };
  if (rows.length > MAX_ROWS) {
    return { ...emptyResult(), error: `Too many rows (max ${MAX_ROWS})` };
  }

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({
      where: { householdId },
      select: { id: true, name: true, currency: true },
    }),
    prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true, type: true },
    }),
  ]);

  const accountByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const categoryByKey = new Map(
    categories.map((c) => [`${c.name.toLowerCase()}|${c.type}`, c.id]),
  );

  let createdAccounts = 0;
  let createdCategories = 0;

  async function ensureAccount(name: string, currency: string) {
    const key = name.toLowerCase();
    const found = accountByName.get(key);
    if (found) return found;
    const created = await prisma.account.create({
      data: { householdId, createdById, name, type: "OTHER", currency },
      select: { id: true, name: true, currency: true },
    });
    accountByName.set(key, created);
    createdAccounts++;
    return created;
  }

  async function ensureCategory(name: string, type: "INCOME" | "EXPENSE") {
    const key = `${name.toLowerCase()}|${type}`;
    const found = categoryByKey.get(key);
    if (found) return found;
    const created = await prisma.category.create({
      data: { householdId, createdById, name, type },
      select: { id: true },
    });
    categoryByKey.set(key, created.id);
    createdCategories++;
    return created.id;
  }

  const toInsert: {
    householdId: string;
    createdById?: string;
    accountId: string;
    categoryId: string | null;
    transferAccountId: string | null;
    type: string;
    amount: number;
    currency: string;
    date: Date;
    description: string | null;
  }[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineNo = i + 2; // header + 1-index

    const dateStr = r.date ?? r.day ?? "";
    const date = new Date(dateStr);
    if (!dateStr || Number.isNaN(date.getTime())) {
      errors.push({ row: lineNo, message: `Invalid or missing date "${dateStr}"` });
      continue;
    }

    const amount = parseFloat(r.amount ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ row: lineNo, message: `Invalid amount "${r.amount ?? ""}"` });
      continue;
    }

    const rawType = (r.type ?? "EXPENSE").toUpperCase();
    const type = (TRANSACTION_TYPES as readonly string[]).includes(rawType)
      ? (rawType as TransactionType)
      : "EXPENSE";

    const accountName = r.account?.trim();
    if (!accountName) {
      errors.push({ row: lineNo, message: "Missing account" });
      continue;
    }

    let currency = (r.currency ?? "").toUpperCase();
    if (!CURRENCY_CODES.includes(currency)) currency = "";

    const account = await ensureAccount(accountName, currency || "USD");
    if (!currency) currency = account.currency;

    let transferAccountId: string | null = null;
    let categoryId: string | null = null;

    if (type === "TRANSFER") {
      const destName = r.transferaccount?.trim();
      if (!destName) {
        errors.push({ row: lineNo, message: "Transfer row missing transferAccount" });
        continue;
      }
      if (destName.toLowerCase() === accountName.toLowerCase()) {
        errors.push({ row: lineNo, message: "Transfer source and destination are the same" });
        continue;
      }
      const dest = await ensureAccount(destName, currency);
      transferAccountId = dest.id;
    } else {
      const catName = r.category?.trim();
      if (catName) {
        categoryId = await ensureCategory(catName, type === "INCOME" ? "INCOME" : "EXPENSE");
      }
    }

    toInsert.push({
      householdId,
      createdById,
      accountId: account.id,
      categoryId,
      transferAccountId,
      type,
      amount,
      currency,
      date,
      description: r.description?.trim() || null,
    });
  }

  if (toInsert.length > 0) {
    await prisma.transaction.createMany({ data: toInsert });
  }

  return {
    imported: toInsert.length,
    skipped: errors.length,
    createdAccounts,
    createdCategories,
    errors: errors.slice(0, 20),
  };
}
