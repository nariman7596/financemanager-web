import { normalizeSms } from "./index";

/**
 * "Always file this description under that category."
 *
 * A rule is created from the Review page when the user confirms a row, and is
 * applied when a later SMS is booked, so a known merchant never waits for a
 * tap. The key is the description the SMS itself produces — the bank's note,
 * the merchant from the OTP ("ازکی"), or the purpose ("پرداخت قبض تلفن همراه").
 *
 * Only descriptions that name something may become rules. A bare kind like
 * "برداشت پول" or "خرید" is on every other message; a rule on it would file
 * unrelated spending under one category without anyone noticing.
 */

export interface CategoryRuleLike {
  type: string;
  match: string;
  categoryId: string;
}

/** The form a description is compared in: spelling, spacing and punctuation folded. */
export function normalizeRuleMatch(description: string): string {
  return normalizeSms(description)
    .replace(/\u200c/g, " ") // ZWNJ: "به\u200cجا" and "به جا" are the same words
    .replace(/[.,،؛:!؟?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Transaction kinds banks print in place of a description. Compared after
// normalisation, so spacing and Arabic letter forms do not matter. Built on
// first use: index.ts re-exports this module, so normalizeSms is not yet
// defined while this file loads.
const GENERIC_KINDS = [
  "برداشت",
  "برداشت پول",
  "برداشت از حساب",
  "واریز",
  "واریز پول",
  "واریز به حساب",
  "خرید",
  "خرید کالا",
  "پرداخت",
  "پرداخت قبض",
  "انتقال",
  "انتقال وجه",
  "انتقال از",
  "انتقال به",
  "کارت به کارت",
  "پایا",
  "ساتنا",
  "کارمزد",
  "سود",
  "قسط",
];
let generic: Set<string> | null = null;
const isGeneric = (m: string) => (generic ??= new Set(GENERIC_KINDS.map(normalizeRuleMatch))).has(m);

/**
 * Whether a description is specific enough to base a rule on. Generic kinds
 * and anything shorter than two letters are not.
 */
export function canMakeRule(description: string | null | undefined): boolean {
  if (!description) return false;
  const m = normalizeRuleMatch(description);
  return m.length >= 2 && !isGeneric(m);
}

/** The rule that files this transaction, if any. Exact match, same type only. */
export function findRule<R extends CategoryRuleLike>(
  rules: R[],
  txn: { type: string; description: string | null | undefined },
): R | null {
  if (!canMakeRule(txn.description)) return null;
  const m = normalizeRuleMatch(txn.description!);
  return rules.find((r) => r.type === txn.type && r.match === m) ?? null;
}
