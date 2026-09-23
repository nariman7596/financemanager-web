import { normalizeSms } from "./index";

/**
 * Suggest a category for a transaction the user has not reviewed yet, from
 * the ones they already have. Pure: the caller passes the history in.
 *
 * Bank SMS carry little to go on — a kind ("خرید"), sometimes a note
 * ("حقوق ماهانه") or a merchant taken from the OTP ("ازکی"), an amount and an
 * account. Two of those are strong on their own:
 *
 * - the same description: salary is always "حقوق ماهانه"
 * - the same amount: an installment or a rent repeats to the rial
 *
 * and the account only helps tell two such matches apart. Each earlier
 * transaction votes for its category with the strength of its match, recent
 * ones louder. A suggestion is made only when one category clearly leads —
 * "خرید" alone matches purchases of every kind and should not pick one.
 */

export type SuggestTarget = {
  type: string;
  accountId: string;
  amount: number;
  currency: string;
  description: string | null;
  date: Date;
};

export type SuggestHistoryItem = SuggestTarget & { categoryId: string };

const DAY = 24 * 60 * 60 * 1000;

function key(description: string | null): string {
  return normalizeSms(description ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function suggestCategory(
  target: SuggestTarget,
  history: SuggestHistoryItem[],
): { categoryId: string; confidence: number } | null {
  const want = key(target.description);
  const votes = new Map<string, number>();

  for (const h of history) {
    if (h.type !== target.type) continue;

    let w = 0;
    if (want && key(h.description) === want) w += 3;
    if (h.currency === target.currency) {
      if (h.amount === target.amount) w += 3;
      else if (Math.abs(h.amount - target.amount) <= 0.1 * Math.max(h.amount, target.amount)) w += 1;
    }
    // Neither the words nor the amount: nothing in common worth a vote.
    if (w < 3) continue;
    if (h.accountId === target.accountId) w += 1;

    const ageDays = Math.max(0, (target.date.getTime() - h.date.getTime()) / DAY);
    w /= 1 + ageDays / 90;
    votes.set(h.categoryId, (votes.get(h.categoryId) ?? 0) + w);
  }

  let best: string | null = null;
  let bestScore = 0;
  let total = 0;
  for (const [id, score] of votes) {
    total += score;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  if (!best || bestScore < 2) return null;
  const confidence = bestScore / total;
  return confidence >= 0.6 ? { categoryId: best, confidence } : null;
}
