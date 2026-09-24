/**
 * The budget planner: from what comes in, what must be set aside and what is
 * fixed, a budget per expense category.
 *
 *   income − savings (a share of income) − fixed costs (rent, loan instalments)
 *     = what the categories share.
 *
 * Categories with spending history are budgeted from it — the household's own
 * habits, not a textbook split — and scaled down if they do not fit, cutting
 * the categories the owner protects (travel, entertainment…) half as hard.
 * Without history (a new user) a default split for the kind of category is
 * used. Frequent small spending gets a weekly budget, because a week is short
 * enough to still change course; the rest are monthly.
 *
 * Pure: the page runs it live in the browser as the inputs change.
 */

export type PlanPeriod = "WEEKLY" | "MONTHLY";

export interface PlanCategory {
  id: string;
  name: string;
  /** Average monthly spending over the recent full months; 0 when none. */
  history: number;
}

export interface PlanInput {
  income: number;
  /** 0–1: the share of income set aside before anything is budgeted. */
  savingsRate: number;
  /** Rent paid monthly (budgeted to a housing category if there is one). */
  rent: number;
  /** Other fixed monthly outflows outside the categories — loan instalments. */
  otherFixed: number;
  categories: PlanCategory[];
  protectedIds: string[];
}

export interface PlanRow {
  categoryId: string;
  name: string;
  period: PlanPeriod;
  /** The monthly figure the row stands for. */
  monthly: number;
  /** The budget per period (weekly rows: a week's share). */
  amount: number;
  basis: "history" | "default" | "rent";
}

export interface Plan {
  savings: number;
  fixed: number;
  /** What the categories share after savings and fixed costs. */
  flexible: number;
  rows: PlanRow[];
  /** Fits with room to spare: this much more could be set aside. */
  extraSavings: number;
  /** Does not fit even after cutting (or savings + fixed exceed income): this much is missing. */
  shortfall: number;
}

type Kind = {
  key: string;
  words: string[];
  share: number;
  weekly?: boolean;
};

// Default monthly shares for a household without history. Tuned for a couple
// renting in a large Iranian city; they only apply until real spending exists.
const KINDS: Kind[] = [
  { key: "housing", words: ["مسکن", "اجاره", "housing", "rent"], share: 0 },
  { key: "groceries", words: ["خواربار", "سوپر", "هایپر", "grocer", "food"], share: 28, weekly: true },
  { key: "dining", words: ["رستوران", "کافه", "بیرون", "dining", "restaurant", "cafe"], share: 8, weekly: true },
  { key: "transport", words: ["حمل", "اسنپ", "تاکسی", "بنزین", "transport", "taxi", "fuel"], share: 8, weekly: true },
  { key: "utilities", words: ["قبض", "قبوض", "utilit", "bill"], share: 6 },
  { key: "health", words: ["سلامت", "درمان", "دارو", "پزشک", "health", "medic"], share: 6 },
  { key: "entertainment", words: ["سرگرمی", "تفریح", "entertain", "fun"], share: 7 },
  { key: "shopping", words: ["خرید", "پوشاک", "لباس", "shopping", "cloth"], share: 8 },
  { key: "travel", words: ["سفر", "travel", "trip"], share: 10 },
  { key: "subscriptions", words: ["اشتراک", "subscript"], share: 0.5 },
  { key: "installments", words: ["اقساط", "قسط", "installment"], share: 0 },
  { key: "other", words: ["متفرقه", "other", "misc"], share: 7 },
];
const UNKNOWN_SHARE = 3;
// Protected categories get a larger default share, and a lighter cut.
const PROTECTED_BOOST = 1.25;
const PROTECTED_CUT = 0.5;

export function categoryKind(name: string): string | null {
  const n = name.toLowerCase().replace(/‌/g, "");
  const kind = KINDS.find((k) => k.words.some((w) => n.includes(w.replace(/‌/g, ""))));
  return kind?.key ?? null;
}

const kindOf = (name: string) => KINDS.find((k) => k.key === categoryKind(name));

/** Budgets read better as round figures: 1,850,000 rather than 1,847,312. */
export function roundBudget(n: number): number {
  if (n <= 0) return 0;
  const step = n < 2_000_000 ? 50_000 : n < 20_000_000 ? 100_000 : 500_000;
  return Math.max(step, Math.round(n / step) * step);
}

const WEEKS_PER_MONTH = 52 / 12;

export function planBudgets(input: PlanInput): Plan {
  const income = Math.max(0, input.income);
  const savings = Math.round(income * Math.min(1, Math.max(0, input.savingsRate)));
  const fixed = Math.max(0, input.rent) + Math.max(0, input.otherFixed);
  const flexible = Math.max(0, income - savings - fixed);
  const isProtected = new Set(input.protectedIds);

  const housing = input.categories.find((c) => categoryKind(c.name) === "housing");
  const rest = input.categories.filter((c) => c !== housing);
  const withHistory = rest.some((c) => c.history > 0);

  // 1. What each category would get before fitting to the money available.
  const wanted = new Map<string, { value: number; basis: PlanRow["basis"] }>();
  if (withHistory) {
    for (const c of rest) if (c.history > 0) wanted.set(c.id, { value: c.history, basis: "history" });
  } else {
    const weight = (c: PlanCategory) =>
      (kindOf(c.name)?.share ?? UNKNOWN_SHARE) * (isProtected.has(c.id) ? PROTECTED_BOOST : 1);
    const total = rest.reduce((s, c) => s + weight(c), 0);
    for (const c of rest) {
      const w = weight(c);
      if (w > 0 && total > 0) wanted.set(c.id, { value: (flexible * w) / total, basis: "default" });
    }
  }

  // 2. Fit: cut if over (protected categories half as hard); history that
  //    fits is kept as is, and what is left over is extra savings.
  const sum = [...wanted.values()].reduce((s, v) => s + v.value, 0);
  let shortfall = 0;
  if (sum > flexible && sum > 0) {
    const cutWeight = (id: string) => (isProtected.has(id) ? PROTECTED_CUT : 1);
    const weighted = [...wanted.entries()].reduce((s, [id, v]) => s + v.value * cutWeight(id), 0);
    const c = Math.min(1, (sum - flexible) / weighted);
    for (const [id, v] of wanted) wanted.set(id, { ...v, value: v.value * (1 - c * cutWeight(id)) });
    const after = [...wanted.values()].reduce((s, v) => s + v.value, 0);
    shortfall = Math.max(0, Math.round(after - flexible));
  }

  // 3. Rows, rounded, weekly where spending is frequent.
  const rows: PlanRow[] = [];
  if (housing && input.rent > 0) {
    rows.push({
      categoryId: housing.id,
      name: housing.name,
      period: "MONTHLY",
      monthly: input.rent,
      amount: input.rent,
      basis: "rent",
    });
  }
  for (const c of rest) {
    const w = wanted.get(c.id);
    if (!w || w.value <= 0) continue;
    const weekly = kindOf(c.name)?.weekly ?? false;
    const amount = roundBudget(weekly ? w.value / WEEKS_PER_MONTH : w.value);
    rows.push({
      categoryId: c.id,
      name: c.name,
      period: weekly ? "WEEKLY" : "MONTHLY",
      monthly: Math.round(weekly ? amount * WEEKS_PER_MONTH : amount),
      amount,
      basis: w.basis,
    });
  }
  rows.sort((a, b) => b.monthly - a.monthly);

  // Savings and fixed costs alone can exceed income; that gap is missing too.
  shortfall += Math.max(0, Math.round(savings + fixed - income));
  const budgeted = rows.filter((r) => r.basis !== "rent").reduce((s, r) => s + r.monthly, 0);
  const extraSavings = withHistory ? Math.max(0, Math.round(flexible - budgeted)) : 0;
  return { savings, fixed, flexible, rows, extraSavings, shortfall };
}
