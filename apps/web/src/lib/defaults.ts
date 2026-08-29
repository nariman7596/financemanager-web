import { prisma } from "./prisma";
import { DEFAULT_LOCALE, type Locale } from "@financemanager/i18n/config";

// Default categories + a starter account, created for every new household so
// the app is usable immediately.
//
// These are rows the household owns, not UI strings — the user can rename or
// delete them. So they are seeded in the user's own language rather than being
// translated at render time. Getting the data right once keeps every consumer
// consistent — tables, forms, charts and the CSV export all read one value —
// and a later rename by the user is simply respected.

type DefaultCategory = {
  /** Stable id for this seeded row; used to re-label existing households. */
  key: string;
  names: Record<Locale, string>;
  type: "INCOME" | "EXPENSE";
  color: string;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { key: "salary",        names: { en: "Salary",        fa: "حقوق" },          type: "INCOME",  color: "#16a34a" },
  { key: "business",      names: { en: "Business",      fa: "کسب‌وکار" },      type: "INCOME",  color: "#0ea5e9" },
  { key: "investments",   names: { en: "Investments",   fa: "سرمایه‌گذاری" },  type: "INCOME",  color: "#8b5cf6" },
  { key: "other_income",  names: { en: "Other Income",  fa: "درآمد متفرقه" },  type: "INCOME",  color: "#22c55e" },
  { key: "housing",       names: { en: "Housing",       fa: "مسکن" },          type: "EXPENSE", color: "#ef4444" },
  { key: "groceries",     names: { en: "Groceries",     fa: "خواربار" },       type: "EXPENSE", color: "#f97316" },
  { key: "transport",     names: { en: "Transport",     fa: "حمل‌ونقل" },      type: "EXPENSE", color: "#eab308" },
  { key: "utilities",     names: { en: "Utilities",     fa: "قبوض" },          type: "EXPENSE", color: "#06b6d4" },
  { key: "dining",        names: { en: "Dining",        fa: "رستوران" },       type: "EXPENSE", color: "#ec4899" },
  { key: "health",        names: { en: "Health",        fa: "سلامت و درمان" }, type: "EXPENSE", color: "#14b8a6" },
  { key: "entertainment", names: { en: "Entertainment", fa: "سرگرمی" },        type: "EXPENSE", color: "#a855f7" },
  { key: "shopping",      names: { en: "Shopping",      fa: "خرید" },          type: "EXPENSE", color: "#f43f5e" },
  { key: "other",         names: { en: "Other",         fa: "متفرقه" },        type: "EXPENSE", color: "#64748b" },
];

/** Name of the starter account, per locale. */
export const DEFAULT_ACCOUNT_NAME: Record<Locale, string> = {
  en: "Cash",
  fa: "نقد",
};

function categoryName(c: DefaultCategory, locale: Locale): string {
  return c.names[locale] ?? c.names[DEFAULT_LOCALE];
}

export async function seedDefaultsForHousehold(
  householdId: string,
  currency: string,
  createdById?: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      name: categoryName(c, locale),
      type: c.type,
      color: c.color,
      householdId,
      createdById,
    })),
  });
  await prisma.account.create({
    data: {
      householdId,
      createdById,
      name: DEFAULT_ACCOUNT_NAME[locale] ?? DEFAULT_ACCOUNT_NAME[DEFAULT_LOCALE],
      type: "CASH",
      currency,
      openingBalance: 0,
    },
  });
}

/**
 * Create a household owned by `userId` (OWNER membership) and seed it with
 * default categories + a Cash account. Returns the new household id.
 */
export async function createHousehold(
  userId: string,
  name: string,
  baseCurrency: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<string> {
  const household = await prisma.household.create({
    data: {
      name,
      baseCurrency,
      members: { create: { userId, role: "OWNER" } },
    },
  });
  await seedDefaultsForHousehold(household.id, baseCurrency, userId, locale);
  return household.id;
}

/**
 * Re-label a household's still-default categories and starter account into
 * `locale`, for households seeded before this was locale-aware.
 *
 * Only rows whose name still exactly matches a seeded name in some language
 * are touched, so anything the user renamed or created themselves is left
 * alone. Ids are preserved, so existing transactions keep their category.
 */
export async function relabelDefaults(
  householdId: string,
  locale: Locale,
): Promise<{ categories: number; accounts: number }> {
  // Every name any locale would have produced -> the seed entry it came from.
  const bySeededName = new Map<string, DefaultCategory>();
  for (const c of DEFAULT_CATEGORIES) {
    for (const n of Object.values(c.names)) bySeededName.set(n, c);
  }

  const existing = await prisma.category.findMany({ where: { householdId } });
  let categories = 0;
  for (const row of existing) {
    const seed = bySeededName.get(row.name);
    if (!seed) continue; // user-created or renamed — leave it alone
    const target = categoryName(seed, locale);
    if (target === row.name) continue;
    await prisma.category.update({ where: { id: row.id }, data: { name: target } });
    categories++;
  }

  const seededAccountNames = Object.values(DEFAULT_ACCOUNT_NAME);
  const target = DEFAULT_ACCOUNT_NAME[locale] ?? DEFAULT_ACCOUNT_NAME[DEFAULT_LOCALE];
  const { count: accounts } = await prisma.account.updateMany({
    where: { householdId, type: "CASH", name: { in: seededAccountNames } },
    data: { name: target },
  });

  return { categories, accounts };
}
