/**
 * Does the app's balance agree with the bank's?
 *
 * Every bank SMS carries the balance after the transaction (stored as
 * `bankBalance`). The app's own balance at that same moment is the opening
 * balance plus every transaction up to and including that one. When they
 * differ, something the bank did never reached the app — a Paya fee the bank
 * charges without an SMS, a wrong opening balance, a missed message.
 *
 * Only the latest SMS-carried balance is compared: it is the bank's most
 * recent word, and a gap found there is the one still open. Transactions are
 * ordered by date, then by when they were recorded, since dates carry no time.
 */

export type ReconcileTxn = {
  id: string;
  type: string; // INCOME | EXPENSE | TRANSFER
  accountId: string;
  transferAccountId: string | null;
  amount: number;
  date: Date;
  createdAt: Date;
  bankBalance: number | null;
};

export type Reconciliation = {
  /** The transaction whose SMS carried the balance compared. */
  txnId: string;
  date: Date;
  createdAt: Date;
  bankBalance: number;
  appBalance: number;
  /** bank − app: positive means the bank holds more than the app shows. */
  gap: number;
};

function effect(t: ReconcileTxn, accountId: string): number {
  if (t.type === "INCOME" && t.accountId === accountId) return t.amount;
  if (t.type === "EXPENSE" && t.accountId === accountId) return -t.amount;
  if (t.type === "TRANSFER") {
    if (t.accountId === accountId) return -t.amount;
    if (t.transferAccountId === accountId) return t.amount;
  }
  return 0;
}

const order = (a: ReconcileTxn, b: ReconcileTxn) =>
  a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime();

/**
 * Compare an account with its bank. Null when no SMS for this account has
 * carried a balance yet. `tolerance` absorbs rounding: a rial balance shown in
 * toman can be off by half a toman.
 */
export function reconcileAccount(
  accountId: string,
  openingBalance: number,
  txns: ReconcileTxn[],
  tolerance = 1,
): Reconciliation | null {
  const sorted = [...txns].sort(order);
  let running = openingBalance;
  let last: Reconciliation | null = null;
  for (const t of sorted) {
    running += effect(t, accountId);
    if (t.accountId === accountId && t.bankBalance !== null) {
      last = {
        txnId: t.id,
        date: t.date,
        createdAt: t.createdAt,
        bankBalance: t.bankBalance,
        appBalance: running,
        gap: t.bankBalance - running,
      };
    }
  }
  if (!last) return null;
  return Math.abs(last.gap) < tolerance ? { ...last, gap: 0 } : last;
}
