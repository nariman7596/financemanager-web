import { describe, it, expect } from "vitest";
import { canMakeRule, findRule, normalizeRuleMatch } from "./rules";

describe("normalizeRuleMatch", () => {
  it("folds spacing, ZWNJ, Arabic letters and trailing punctuation", () => {
    expect(normalizeRuleMatch("  بازپرداخت بدهی وام به\u200cجا، ")).toBe("بازپرداخت بدهی وام به جا");
    expect(normalizeRuleMatch("ازكي")).toBe(normalizeRuleMatch("ازکی"));
    expect(normalizeRuleMatch("Snapp Food.")).toBe("snapp food");
  });
});

describe("canMakeRule", () => {
  it("accepts descriptions that name something", () => {
    expect(canMakeRule("ازکی")).toBe(true);
    expect(canMakeRule("پرداخت قبض تلفن همراه")).toBe(true);
    expect(canMakeRule("حقوق ماهانه")).toBe(true);
  });

  it("refuses bare transaction kinds, which are on every other message", () => {
    for (const k of ["برداشت پول", "واریز پول", "خرید", "پرداخت قبض", "پایا", " برداشت  پول. "]) {
      expect(canMakeRule(k)).toBe(false);
    }
  });

  it("refuses nothing at all", () => {
    expect(canMakeRule(null)).toBe(false);
    expect(canMakeRule("")).toBe(false);
    expect(canMakeRule("x")).toBe(false);
  });
});

describe("findRule", () => {
  const rules = [
    { type: "EXPENSE", match: normalizeRuleMatch("ازکی"), categoryId: "food", transferAccountId: null },
    { type: "INCOME", match: normalizeRuleMatch("حقوق ماهانه"), categoryId: "salary", transferAccountId: null },
  ];

  it("files a matching description of the same type", () => {
    expect(findRule(rules, { type: "EXPENSE", description: "ازكي" })?.categoryId).toBe("food");
  });

  it("never files across types", () => {
    // A refund from the same merchant is income, not groceries.
    expect(findRule(rules, { type: "INCOME", description: "ازکی" })).toBeNull();
  });

  it("does not match on a partial description", () => {
    expect(findRule(rules, { type: "EXPENSE", description: "ازکی مارکت" })).toBeNull();
  });

  it("ignores generic descriptions even if a rule somehow exists for one", () => {
    const bad = [{ type: "EXPENSE", match: normalizeRuleMatch("برداشت پول"), categoryId: "x", transferAccountId: null }];
    expect(findRule(bad, { type: "EXPENSE", description: "برداشت پول" })).toBeNull();
  });
});
