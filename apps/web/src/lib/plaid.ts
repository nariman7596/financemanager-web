import "server-only";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
} from "plaid";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto";
import { TRANSACTION_TYPES } from "@financemanager/core/constants";

// ---------------------------------------------------------------------------
// Bank sync via Plaid. Mirrors the shape of marketdata.ts / recurring.ts:
//   - fetch/store split, graceful failure (never throws out of the module)
//   - an idempotent sync core (syncTransactionsForItem) callable from both a
//     Server Action (one household) and the cron route (all households)
//
// Keyless-by-default integrations elsewhere in this app degrade gracefully
// when unconfigured; Plaid can't (it always needs credentials), so every
// exported function here returns a `{ error }` result instead of throwing
// when PLAID_CLIENT_ID/PLAID_SECRET are unset.
// ---------------------------------------------------------------------------

export function plaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

let _client: PlaidApi | null = null;
function client(): PlaidApi {
  if (_client) return _client;
  const env = process.env.PLAID_ENV ?? "sandbox";
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  _client = new PlaidApi(configuration);
  return _client;
}

// --- Link -------------------------------------------------------------------

export async function createLinkToken(
  userId: string,
): Promise<{ linkToken?: string; error?: string }> {
  if (!plaidConfigured()) return { error: "Bank sync is not configured" };
  try {
    const res = await client().linkTokenCreate({
      client_name: "FinanceManager",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: userId },
      products: [Products.Transactions],
    });
    return { linkToken: res.data.link_token };
  } catch (e) {
    return { error: plaidErrorMessage(e) };
  }
}

export type PlaidAccountOption = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
};

/**
 * Exchange a Link public_token for an access_token, create the PlaidItem row
 * (token encrypted at rest), and return the item's accounts for the mapping
 * UI. Does not link/create any local Account — that's a separate step
 * (mapPlaidAccounts) so a household member explicitly matches each Plaid
 * account to an existing Account instead of new ones being auto-created.
 */
export async function exchangePublicToken(
  householdId: string,
  createdById: string | undefined,
  publicToken: string,
): Promise<{ plaidItemDbId?: string; accounts?: PlaidAccountOption[]; error?: string }> {
  if (!plaidConfigured()) return { error: "Bank sync is not configured" };
  try {
    const exchange = await client().itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const institutionName = await fetchInstitutionName(accessToken);
    const accountsRes = await client().accountsGet({ access_token: accessToken });

    const item = await prisma.plaidItem.create({
      data: {
        householdId,
        createdById,
        itemId,
        accessToken: encrypt(accessToken),
        institutionName,
      },
    });

    const accounts: PlaidAccountOption[] = accountsRes.data.accounts.map((a) => ({
      plaidAccountId: a.account_id,
      name: a.name,
      mask: a.mask,
      type: String(a.type),
      subtype: a.subtype ? String(a.subtype) : null,
    }));

    return { plaidItemDbId: item.id, accounts };
  } catch (e) {
    return { error: plaidErrorMessage(e) };
  }
}

async function fetchInstitutionName(accessToken: string): Promise<string | undefined> {
  try {
    const itemRes = await client().itemGet({ access_token: accessToken });
    const institutionId = itemRes.data.item.institution_id;
    if (!institutionId) return undefined;
    const instRes = await client().institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    return instRes.data.institution.name;
  } catch {
    return undefined;
  }
}

/** Revoke access at Plaid and remove the item row. */
export async function removePlaidItem(plaidItemDbId: string): Promise<void> {
  const item = await prisma.plaidItem.findUnique({ where: { id: plaidItemDbId } });
  if (!item) return;
  if (plaidConfigured()) {
    try {
      await client().itemRemove({ access_token: decrypt(item.accessToken) });
    } catch {
      // Best-effort revoke; still remove our record either way.
    }
  }
  await prisma.plaidItem.delete({ where: { id: plaidItemDbId } });
}

// --- Transaction sync --------------------------------------------------------

export function mapPlaidTransaction(t: PlaidTransaction): {
  type: (typeof TRANSACTION_TYPES)[number];
  amount: number;
  categoryName: string;
} {
  // Plaid: positive amount = money leaving the account (outflow), negative =
  // inflow. This app: amount is always positive, `type` carries direction.
  const type = t.amount > 0 ? "EXPENSE" : "INCOME";
  const categoryName = t.personal_finance_category?.primary
    ? titleCase(t.personal_finance_category.primary)
    : t.category?.[0] ?? "Uncategorized";
  return { type, amount: Math.abs(t.amount), categoryName };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export type ItemSyncResult = { added: number; modified: number; removed: number; error?: string };

/**
 * Idempotent sync core for one PlaidItem: pages /transactions/sync from the
 * stored cursor, upserts by plaidTransactionId (the dedup key the CSV
 * importer lacks), and only advances the cursor after a successful batch —
 * same "re-run is a no-op" idempotency as postDueRecurring's nextRunDate.
 * Transactions on Plaid accounts nobody mapped to a local Account are
 * skipped. Never throws; failures are recorded on the PlaidItem row.
 */
export async function syncTransactionsForItem(item: {
  id: string;
  householdId: string;
  createdById: string | null;
  accessToken: string;
  transactionsCursor: string | null;
}): Promise<ItemSyncResult> {
  const result: ItemSyncResult = { added: 0, modified: 0, removed: 0 };
  try {
    const accessToken = decrypt(item.accessToken);

    const linkedAccounts = await prisma.account.findMany({
      where: { plaidItemId: item.id },
      select: { id: true, plaidAccountId: true },
    });
    const localAccountByPlaidId = new Map(
      linkedAccounts.filter((a) => a.plaidAccountId).map((a) => [a.plaidAccountId as string, a.id]),
    );

    const categories = await prisma.category.findMany({
      where: { householdId: item.householdId },
      select: { id: true, name: true, type: true },
    });
    const categoryByKey = new Map(
      categories.map((c) => [`${c.name.toLowerCase()}|${c.type}`, c.id]),
    );
    async function ensureCategory(name: string, type: "INCOME" | "EXPENSE") {
      const key = `${name.toLowerCase()}|${type}`;
      const found = categoryByKey.get(key);
      if (found) return found;
      const created = await prisma.category.create({
        data: { householdId: item.householdId, createdById: item.createdById ?? undefined, name, type },
        select: { id: true },
      });
      categoryByKey.set(key, created.id);
      return created.id;
    }

    let cursor = item.transactionsCursor ?? undefined;
    let hasMore = true;

    while (hasMore) {
      const res = await client().transactionsSync({ access_token: accessToken, cursor });

      for (const t of [...res.data.added, ...res.data.modified]) {
        const localAccountId = localAccountByPlaidId.get(t.account_id);
        if (!localAccountId) continue; // account not mapped — skip its transactions

        const { type, amount, categoryName } = mapPlaidTransaction(t);
        const categoryId =
          type === "TRANSFER" ? null : await ensureCategory(categoryName, type);

        const isNew = !(await prisma.transaction.findUnique({
          where: { plaidTransactionId: t.transaction_id },
          select: { id: true },
        }));

        await prisma.transaction.upsert({
          where: { plaidTransactionId: t.transaction_id },
          create: {
            householdId: item.householdId,
            createdById: item.createdById,
            accountId: localAccountId,
            categoryId,
            type,
            amount,
            currency: t.iso_currency_code ?? "USD",
            date: new Date(t.date),
            description: t.merchant_name ?? t.name,
            plaidTransactionId: t.transaction_id,
            pending: t.pending,
          },
          update: {
            amount,
            currency: t.iso_currency_code ?? "USD",
            date: new Date(t.date),
            description: t.merchant_name ?? t.name,
            pending: t.pending,
            categoryId,
          },
        });
        if (isNew) result.added++;
        else result.modified++;
      }

      for (const r of res.data.removed) {
        if (!r.transaction_id) continue;
        const deleted = await prisma.transaction.deleteMany({
          where: { plaidTransactionId: r.transaction_id },
        });
        result.removed += deleted.count;
      }

      cursor = res.data.next_cursor;
      hasMore = res.data.has_more;

      // Persist progress after each successful page so a mid-run failure
      // doesn't re-process already-applied pages next time.
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { transactionsCursor: cursor, status: "ACTIVE", error: null },
      });
    }

    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { lastSyncedAt: new Date() },
    });

    return result;
  } catch (e) {
    const message = plaidErrorMessage(e);
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status: "ERROR", error: message },
    });
    return { ...result, error: message };
  }
}

export type BankSyncSummary = {
  items: number;
  added: number;
  modified: number;
  removed: number;
  errors: string[];
};

/**
 * Sync every PlaidItem in scope. Pass a householdId for the in-app "Sync
 * now" button, or omit to process every household (cron).
 */
export async function refreshBankSync(householdId?: string): Promise<BankSyncSummary> {
  const summary: BankSyncSummary = { items: 0, added: 0, modified: 0, removed: 0, errors: [] };
  if (!plaidConfigured()) return summary;

  const items = await prisma.plaidItem.findMany({
    where: { ...(householdId ? { householdId } : {}), status: { not: "REVOKED" } },
  });

  for (const item of items) {
    const res = await syncTransactionsForItem(item);
    summary.items++;
    summary.added += res.added;
    summary.modified += res.modified;
    summary.removed += res.removed;
    if (res.error) summary.errors.push(`${item.institutionName ?? item.itemId}: ${res.error}`);
  }

  return summary;
}

function plaidErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const resp = (e as { response?: { data?: { error_message?: string } } }).response;
    if (resp?.data?.error_message) return resp.data.error_message;
  }
  return e instanceof Error ? e.message : "Bank sync failed";
}
