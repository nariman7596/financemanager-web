import { prisma } from "./prisma";
import { toNumber } from "@financemanager/core/money";
import { reconcileAccount, type Reconciliation } from "@financemanager/core/reconcile";

/**
 * Compare each account that has bank SMS with the balance its bank last
 * reported. Accounts without an SMS-carried balance are left out.
 */
export async function getReconciliations(
  householdId: string,
  accountId?: string,
): Promise<Map<string, Reconciliation>> {
  const withBank = await prisma.transaction.findMany({
    where: { householdId, bankBalance: { not: null }, ...(accountId ? { accountId } : {}) },
    distinct: ["accountId"],
    select: { accountId: true },
  });
  const ids = withBank.map((w) => w.accountId);
  const out = new Map<string, Reconciliation>();
  if (ids.length === 0) return out;

  const [accounts, txns] = await Promise.all([
    prisma.account.findMany({
      where: { householdId, id: { in: ids } },
      select: { id: true, openingBalance: true },
    }),
    prisma.transaction.findMany({
      where: { householdId, OR: [{ accountId: { in: ids } }, { transferAccountId: { in: ids } }] },
      select: {
        id: true, type: true, accountId: true, transferAccountId: true,
        amount: true, date: true, createdAt: true, bankBalance: true,
      },
    }),
  ]);
  const rows = txns.map((t) => ({
    ...t,
    amount: toNumber(t.amount),
    bankBalance: t.bankBalance === null ? null : toNumber(t.bankBalance),
  }));
  for (const a of accounts) {
    const r = reconcileAccount(a.id, toNumber(a.openingBalance), rows);
    if (r) out.set(a.id, r);
  }
  return out;
}
