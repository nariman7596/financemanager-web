import { DEFAULT_LOCALE, type Locale } from "@financemanager/i18n/config";

// The built-in category tree. Pure data, so it lives here rather than beside
// the Prisma calls that write it: mobile seeds the same tree offline, and a
// typo in a `parent` key silently drops a category at seed time, which is
// exactly the kind of thing a test should catch rather than a user.

export type DefaultCategory = {
  /** Stable id for this seeded row; stored as Category.seedKey. */
  key: string;
  names: Record<Locale, string>;
  type: "INCOME" | "EXPENSE" | "INVESTMENT";
  color: string;
  /** Parent's `key`, for a sub-category. Nesting is one level only. */
  parent?: string;
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

  // --- INVESTMENT: cash FLOWS in and out of investing ---
  // Distinct from the Investment model, which is a holding. Keeping them apart
  // is what lets "money I put into investing this month" appear in cash-flow
  // reports without double-counting the portfolio's mark-to-market value.
  { key: "inv_contribution", names: { en: "Contributions", fa: "آورده" },       type: "INVESTMENT", color: "#6366f1" },
  { key: "inv_dividend",     names: { en: "Dividends",     fa: "سود سهام" },    type: "INVESTMENT", color: "#10b981" },
  { key: "inv_fees",         names: { en: "Fees",          fa: "کارمزد" },      type: "INVESTMENT", color: "#94a3b8" },
  { key: "inv_withdrawal",   names: { en: "Withdrawals",   fa: "برداشت" },      type: "INVESTMENT", color: "#f59e0b" },

  // --- sub-categories (one level deep) ---
  // A parent may still hold transactions directly; reports roll children up
  // into their parent. Requiring a leaf would have orphaned every transaction
  // already filed against a top-level category.
  { key: "rent",            names: { en: "Rent",             fa: "اجاره" },             type: "EXPENSE", color: "#ef4444", parent: "housing" },
  { key: "mortgage",        names: { en: "Mortgage",         fa: "وام مسکن" },          type: "EXPENSE", color: "#ef4444", parent: "housing" },
  { key: "home_repairs",    names: { en: "Repairs",          fa: "تعمیرات" },           type: "EXPENSE", color: "#ef4444", parent: "housing" },

  { key: "fuel",            names: { en: "Fuel",             fa: "سوخت" },              type: "EXPENSE", color: "#eab308", parent: "transport" },
  { key: "public_transit",  names: { en: "Public Transport", fa: "حمل‌ونقل عمومی" },    type: "EXPENSE", color: "#eab308", parent: "transport" },
  { key: "taxi",            names: { en: "Taxi",             fa: "تاکسی" },             type: "EXPENSE", color: "#eab308", parent: "transport" },
  { key: "car_service",     names: { en: "Vehicle Service",  fa: "تعمیر خودرو" },       type: "EXPENSE", color: "#eab308", parent: "transport" },

  { key: "electricity",     names: { en: "Electricity",      fa: "برق" },               type: "EXPENSE", color: "#06b6d4", parent: "utilities" },
  { key: "water",           names: { en: "Water",            fa: "آب" },                type: "EXPENSE", color: "#06b6d4", parent: "utilities" },
  { key: "gas_bill",        names: { en: "Gas",              fa: "گاز" },               type: "EXPENSE", color: "#06b6d4", parent: "utilities" },
  { key: "internet",        names: { en: "Internet",         fa: "اینترنت" },           type: "EXPENSE", color: "#06b6d4", parent: "utilities" },
  { key: "mobile",          names: { en: "Mobile",           fa: "تلفن همراه" },        type: "EXPENSE", color: "#06b6d4", parent: "utilities" },

  { key: "cafe",            names: { en: "Cafe",             fa: "کافه" },              type: "EXPENSE", color: "#ec4899", parent: "dining" },
  { key: "food_delivery",   names: { en: "Delivery",         fa: "سفارش غذا" },         type: "EXPENSE", color: "#ec4899", parent: "dining" },

  { key: "doctor",          names: { en: "Doctor",           fa: "پزشک" },              type: "EXPENSE", color: "#14b8a6", parent: "health" },
  { key: "pharmacy",        names: { en: "Pharmacy",         fa: "داروخانه" },          type: "EXPENSE", color: "#14b8a6", parent: "health" },
  { key: "insurance",       names: { en: "Insurance",        fa: "بیمه" },              type: "EXPENSE", color: "#14b8a6", parent: "health" },

  { key: "subscriptions",   names: { en: "Subscriptions",    fa: "اشتراک‌ها" },         type: "EXPENSE", color: "#a855f7", parent: "entertainment" },
  { key: "travel",          names: { en: "Travel",           fa: "سفر" },               type: "EXPENSE", color: "#a855f7", parent: "entertainment" },

  { key: "clothing",        names: { en: "Clothing",         fa: "پوشاک" },             type: "EXPENSE", color: "#f43f5e", parent: "shopping" },
  { key: "electronics",     names: { en: "Electronics",      fa: "لوازم برقی" },        type: "EXPENSE", color: "#f43f5e", parent: "shopping" },
  { key: "home_goods",      names: { en: "Home",             fa: "لوازم خانه" },        type: "EXPENSE", color: "#f43f5e", parent: "shopping" },
];

/** Top-level categories, in seed order. */
export function rootCategories(): DefaultCategory[] {
  return DEFAULT_CATEGORIES.filter((c) => !c.parent);
}

/** Sub-categories, in seed order. */
export function childCategories(): DefaultCategory[] {
  return DEFAULT_CATEGORIES.filter((c) => c.parent);
}

/** The name this category is seeded with in `locale`. */
export function categoryName(c: DefaultCategory, locale: Locale): string {
  return c.names[locale] ?? c.names[DEFAULT_LOCALE];
}
