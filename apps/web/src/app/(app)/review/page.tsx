import Link from "next/link";
import { RotateCcw, X } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, toNumber } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { DeleteButton } from "@/components/DeleteButton";
import { SmsReviewForm } from "@/components/forms/SmsReviewForm";
import { deleteTransaction } from "@/app/actions/transactions";
import { retrySms, dismissSms } from "@/app/actions/sms";
import { getT, getLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Transactions booked from bank SMS, waiting for the user to say what they
 * were for — plus messages that could not be read or matched to an account.
 */
export default async function ReviewPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const canEdit = ctx.role !== "VIEWER";

  const [pending, categories, accounts, failed] = await Promise.all([
    prisma.transaction.findMany({
      where: { householdId: ctx.householdId, needsReview: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { account: { select: { id: true, name: true, currency: true } }, smsMessage: { select: { body: true } } },
    }),
    prisma.category.findMany({
      where: { householdId: ctx.householdId, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.account.findMany({
      where: { householdId: ctx.householdId, isArchived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.smsMessage.findMany({
      where: { householdId: ctx.householdId, status: { in: ["UNPARSED", "UNMATCHED"] } },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  return (
    <>
      <Topbar title={t("review.title")} subtitle={t("review.subtitle")} />

      {pending.length === 0 && failed.length === 0 && (
        <div className="card p-10 text-center text-slate-400 space-y-2">
          <p>{t("review.empty")}</p>
          <p className="text-xs">
            <Link href="/settings#sms" className="text-brand-600 hover:underline underline-offset-2">
              {t("review.setupLink")}
            </Link>
          </p>
        </div>
      )}

      <div className="space-y-3">
        {pending.map((txn) => {
          const out = txn.type === "EXPENSE";
          return (
            <div key={txn.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("text-lg font-semibold tabular-nums", out ? "text-red-600" : "text-emerald-600")}>
                    {out ? "−" : "+"}{formatMoney(toNumber(txn.amount), txn.currency)}
                  </p>
                  {/* Separate spans, not " · " inline: a middle dot beside a
                      Persian digit reads as ۰ — "· ۱ مهر" looked like "۱۰ مهر". */}
                  <p className="text-sm text-[var(--muted)] flex flex-wrap items-center gap-x-2">
                    <span>{txn.account.name}</span>
                    <span aria-hidden className="text-slate-300">|</span>
                    <span>{formatDate(txn.date, locale)}</span>
                    {txn.description && (
                      <>
                        <span aria-hidden className="text-slate-300">|</span>
                        <span>{txn.description}</span>
                      </>
                    )}
                  </p>
                  {txn.bankBalance !== null && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t("review.bankBalance", { amount: formatMoney(toNumber(txn.bankBalance), txn.currency) })}
                    </p>
                  )}
                </div>
                {canEdit && <DeleteButton action={deleteTransaction} id={txn.id} />}
              </div>

              {canEdit && (
                <SmsReviewForm
                  id={txn.id}
                  description={txn.description}
                  categories={categories.filter((c) => c.type === txn.type)}
                  transferAccounts={accounts.filter(
                    (a) => a.id !== txn.accountId && a.currency === txn.currency,
                  )}
                />
              )}

              {txn.smsMessage && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer select-none">{t("review.showSms")}</summary>
                  <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="mt-2 whitespace-pre-wrap surface-subtle rounded-lg p-2 font-sans">{txn.smsMessage.body}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {failed.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-1">{t("review.failedTitle")}</h2>
          <p className="text-xs text-slate-400 mb-3">{t("review.failedHint")}</p>
          <div className="space-y-3">
            {failed.map((m) => (
              <div key={m.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="badge surface-subtle text-[var(--muted)]">
                    {m.status === "UNMATCHED" ? t("review.unmatched") : t("review.unparsed")}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(m.receivedAt, locale)}</span>
                </div>
                <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="whitespace-pre-wrap text-sm surface-subtle rounded-lg p-2 font-sans">{m.body}</pre>
                {m.status === "UNMATCHED" && (
                  <p className="text-xs text-slate-400">
                    {t("review.unmatchedHint")}{" "}
                    <Link href="/accounts" className="text-brand-600 hover:underline underline-offset-2">
                      {t("nav.accounts")}
                    </Link>
                  </p>
                )}
                {canEdit && (
                  <div className="flex gap-2">
                    <form action={retrySms}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="btn-ghost border border-[var(--border)] text-sm">
                        <RotateCcw size={14} /> {t("review.retry")}
                      </button>
                    </form>
                    <form action={dismissSms}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="btn-ghost text-sm text-slate-400">
                        <X size={14} /> {t("review.dismiss")}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
