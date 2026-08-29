import { prisma } from "./prisma";
import { DEFAULT_LOCALE, type Locale } from "@financemanager/i18n/config";
import {
  DEFAULT_CATEGORIES,
  categoryName,
  childCategories,
  rootCategories,
} from "@financemanager/core/categories";

// Default categories + a starter account, created for every new household so
// the app is usable immediately.
//
// These are rows the household owns, not UI strings — the user can rename or
// delete them. So they are seeded in the user's own language rather than being
// translated at render time. Getting the data right once keeps every consumer
// consistent — tables, forms, charts and the CSV export all read one value —
// and a later rename by the user is simply respected.



/** Name of the starter account, per locale. */
export const DEFAULT_ACCOUNT_NAME: Record<Locale, string> = {
  en: "Cash",
  fa: "نقد",
};

export async function seedDefaultsForHousehold(
  householdId: string,
  currency: string,
  createdById?: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  await seedDefaultCategories(householdId, locale, createdById);

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
 * Create the default category tree for a household.
 *
 * Exported because the demo seed needs exactly the same tree: it used to build
 * its own flat copy from DEFAULT_CATEGORIES, which silently skipped both the
 * parent links and `seedKey` the moment sub-categories were introduced. One
 * implementation, two callers.
 */
export async function seedDefaultCategories(
  householdId: string,
  locale: Locale = DEFAULT_LOCALE,
  createdById?: string,
) {
  // Parents first, so the children can point at real ids. `seedKey` is what
  // identifies a seeded row from here on -- see relabelDefaults.
  const roots = rootCategories();
  const children = childCategories();

  await prisma.category.createMany({
    data: roots.map((c) => ({
      name: categoryName(c, locale),
      type: c.type,
      color: c.color,
      seedKey: c.key,
      householdId,
      createdById,
    })),
  });

  const rootIdByKey = new Map(
    (
      await prisma.category.findMany({
        where: { householdId, seedKey: { in: roots.map((c) => c.key) } },
        select: { id: true, seedKey: true },
      })
    ).map((r) => [r.seedKey!, r.id]),
  );

  await prisma.category.createMany({
    data: children.flatMap((c) => {
      const parentId = rootIdByKey.get(c.parent!);
      if (!parentId) return []; // parent missing -> skip rather than orphan
      return [{
        name: categoryName(c, locale),
        type: c.type,
        color: c.color,
        seedKey: c.key,
        parentId,
        householdId,
        createdById,
      }];
    }),
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
  // Keyed by seedKey rather than by matching the localised name. Name matching
  // mislabelled any category a user had renamed to text that happened to equal
  // another locale's seed string; the key cannot collide. Rows seeded before
  // this column existed were backfilled by the sync_foundations migration.
  const bySeedKey = new Map(DEFAULT_CATEGORIES.map((c) => [c.key, c]));

  const existing = await prisma.category.findMany({ where: { householdId } });
  let categories = 0;
  for (const row of existing) {
    const seed = row.seedKey ? bySeedKey.get(row.seedKey) : undefined;
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
