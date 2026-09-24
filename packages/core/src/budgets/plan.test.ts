import { describe, it, expect } from "vitest";
import { categoryKind, planBudgets, roundBudget } from "./plan";

// The owner's categories (Persian defaults plus his own).
const cats = (history: Record<string, number> = {}) =>
  [
    "مسکن", "خواربار", "حمل‌ونقل", "قبوض", "رستوران", "سلامت و درمان",
    "سرگرمی", "خرید", "متفرقه", "اقساط", "اشتراک وی پی ان", "سفر",
  ].map((name) => ({ id: name, name, history: history[name] ?? 0 }));

const owner = {
  income: 125_000_000,
  savingsRate: 0.3,
  rent: 22_000_000,
  otherFixed: 2_315_863, // the Blu loan instalment
  protectedIds: ["سفر", "سرگرمی"],
};

describe("categoryKind", () => {
  it("reads Persian and English names, with or without ZWNJ", () => {
    expect(categoryKind("حمل‌ونقل")).toBe("transport");
    expect(categoryKind("حملونقل")).toBe("transport");
    expect(categoryKind("Groceries")).toBe("groceries");
    expect(categoryKind("اشتراک وی پی ان")).toBe("subscriptions");
    expect(categoryKind("باشگاه")).toBeNull();
  });
});

describe("roundBudget", () => {
  it("rounds to steps that grow with the amount", () => {
    expect(roundBudget(1_847_312)).toBe(1_850_000);
    expect(roundBudget(7_860_000)).toBe(7_900_000);
    expect(roundBudget(22_300_000)).toBe(22_500_000);
    expect(roundBudget(10)).toBe(50_000);
    expect(roundBudget(0)).toBe(0);
  });
});

describe("planBudgets without history", () => {
  const plan = planBudgets({ ...owner, categories: cats() });

  it("sets savings aside first and takes fixed costs off the top", () => {
    expect(plan.savings).toBe(37_500_000);
    expect(plan.fixed).toBe(24_315_863);
    expect(plan.flexible).toBe(63_184_137);
  });

  it("budgets rent to the housing category, and no instalment budget without history", () => {
    const housing = plan.rows.find((r) => r.name === "مسکن")!;
    expect(housing).toMatchObject({ amount: 22_000_000, basis: "rent", period: "MONTHLY" });
    expect(plan.rows.find((r) => r.name === "اقساط")).toBeUndefined();
  });

  it("uses weekly budgets for frequent spending", () => {
    const period = (n: string) => plan.rows.find((r) => r.name === n)!.period;
    expect(period("خواربار")).toBe("WEEKLY");
    expect(period("رستوران")).toBe("WEEKLY");
    expect(period("حمل‌ونقل")).toBe("WEEKLY");
    expect(period("قبوض")).toBe("MONTHLY");
  });

  it("gives protected categories a larger share", () => {
    const m = (n: string) => plan.rows.find((r) => r.name === n)!.monthly;
    // Travel's default share is 10 vs shopping's 8; protected, 12.5 vs 8.
    expect(m("سفر") / m("خرید")).toBeGreaterThan(1.4);
  });

  it("stays within what is available, give or take rounding", () => {
    const flexibleRows = plan.rows.filter((r) => r.basis !== "rent");
    const total = flexibleRows.reduce((s, r) => s + r.monthly, 0);
    expect(Math.abs(total - plan.flexible)).toBeLessThan(flexibleRows.length * 250_000);
    expect(plan.shortfall).toBe(0);
  });
});

describe("planBudgets with history", () => {
  it("keeps habits that fit and reports the room left as extra savings", () => {
    const plan = planBudgets({ ...owner, categories: cats({ "خواربار": 20_000_000, "قبوض": 3_000_000 }) });
    expect(plan.rows.find((r) => r.name === "قبوض")).toMatchObject({ amount: 3_000_000, basis: "history" });
    // Only categories with history are budgeted; the rest is extra savings.
    expect(plan.rows.find((r) => r.name === "سفر")).toBeUndefined();
    expect(plan.extraSavings).toBeGreaterThan(35_000_000);
  });

  it("cuts habits that do not fit, protected ones half as hard", () => {
    const plan = planBudgets({
      ...owner,
      categories: cats({ "خرید": 40_000_000, "سفر": 40_000_000 }),
    });
    const m = (n: string) => plan.rows.find((r) => r.name === n)!.monthly;
    expect(m("سفر")).toBeGreaterThan(m("خرید"));
    expect(m("سفر") + m("خرید")).toBeLessThanOrEqual(plan.flexible + 1_000_000);
    expect(plan.extraSavings).toBe(0);
  });

  it("reports a shortfall when fixed costs leave nothing", () => {
    const plan = planBudgets({ ...owner, rent: 90_000_000, categories: cats({ "خواربار": 20_000_000 }) });
    expect(plan.flexible).toBe(0);
    expect(plan.shortfall).toBeGreaterThan(0);
  });
});
