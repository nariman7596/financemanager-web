/**
 * Where a loan stands. The account's balance is negative while money is owed;
 * each instalment is a transfer into it. With the size of the last instalment
 * the number left is a division — shown as an estimate, since the last one is
 * often smaller.
 */
export interface LoanStatus {
  /** What is still owed; 0 once paid off (or overpaid). */
  debt: number;
  /** Instalments left at the last instalment's size; null without one. */
  paymentsLeft: number | null;
}

export function loanStatus(balance: number, lastPayment: number | null): LoanStatus {
  const debt = balance < 0 ? -balance : 0;
  if (debt === 0 || !lastPayment || lastPayment <= 0) return { debt, paymentsLeft: null };
  // A hair of tolerance so 3 × 100.00 against 300.0000001 is 3, not 4.
  return { debt, paymentsLeft: Math.ceil(debt / lastPayment - 1e-6) };
}
