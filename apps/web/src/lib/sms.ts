import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  looksLikeTransaction,
  matchSmsAccount,
  normalizeSms,
  parseBankSms,
  rialTo,
  splitSmsBatch,
} from "@financemanager/core/sms";

/**
 * SMS import: the database half of @financemanager/core/sms.
 *
 * The phone posts raw bank messages to /api/ingest/sms with a device key. Each
 * message is stored once (keyed by the hash of its normalised text), parsed,
 * matched to an account by the number its bank prints, and booked straight
 * away as a transaction flagged `needsReview` — so balances are right at once
 * and the user only has to say what it was for. A message that cannot be read
 * or matched is kept, not dropped, and can be retried once the account is set.
 */

// ---------------------------------------------------------------------------
// Device keys
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = "fm_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new random key. Only the hash is stored; the token is shown once. */
export function newApiToken(): { token: string; tokenHash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, 8) };
}

export type SmsScope = { householdId: string; userId: string };

/** Resolve `Authorization: Bearer fm_…` to the household it may write to. */
export async function authenticateApiToken(header: string | null): Promise<SmsScope | null> {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return null;
  // The key's owner must still belong to the household it was issued for.
  const member = await prisma.membership.findUnique({
    where: { householdId_userId: { householdId: row.householdId, userId: row.userId } },
    select: { role: true },
  });
  if (!member || member.role === "VIEWER") return null;
  await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { householdId: row.householdId, userId: row.userId };
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export type SmsOutcome = "BOOKED" | "DUPLICATE" | "UNPARSED" | "UNMATCHED" | "IGNORED";

function smsHash(text: string): string {
  return createHash("sha256").update(normalizeSms(text)).digest("hex");
}

/**
 * Parse a stored message and, if it matches an account, book it. Used for
 * fresh messages and for retries, so both follow exactly one path. `asOf` is
 * when the message arrived — the year of a "07/01" date is inferred from it,
 * not from whenever a retry happens to run.
 */
async function processMessage(
  scope: SmsScope,
  message: { id: string; body: string; receivedAt: Date },
): Promise<SmsOutcome> {
  const parsed = parseBankSms(message.body, message.receivedAt);
  if (!parsed) {
    // A login notice or an OTP from the bank's number is kept (so it is not
    // re-processed) but never shown; only an unreadable *transaction* is.
    const status = looksLikeTransaction(message.body) ? "UNPARSED" : "IGNORED";
    await prisma.smsMessage.update({ where: { id: message.id }, data: { status } });
    return status;
  }

  // Only rial/toman accounts: an SMS amount is always rial, and a balance is
  // summed in the account's own currency.
  const accounts = await prisma.account.findMany({
    where: {
      householdId: scope.householdId,
      isArchived: false,
      currency: { in: ["IRR", "IRT"] },
      smsMatch: { not: null },
    },
    select: { id: true, currency: true, smsMatch: true },
  });
  const account = matchSmsAccount(parsed.accountRef, accounts);
  if (!account) {
    await prisma.smsMessage.update({ where: { id: message.id }, data: { status: "UNMATCHED" } });
    return "UNMATCHED";
  }

  const { amount, currency } = rialTo(account.currency, parsed.amountRial);
  const balance =
    parsed.balanceRial === null ? null : rialTo(account.currency, parsed.balanceRial).amount;

  await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        householdId: scope.householdId,
        createdById: scope.userId,
        accountId: account.id,
        type: parsed.direction === "OUT" ? "EXPENSE" : "INCOME",
        amount,
        currency,
        date: parsed.date,
        // The bank's own note ("حقوق ماهانه") says more than the kind ("واریز").
        description: parsed.note ?? parsed.kind,
        origin: "SMS",
        needsReview: true,
        bankBalance: balance,
      },
    });
    await tx.smsMessage.update({
      where: { id: message.id },
      data: { status: "BOOKED", transactionId: txn.id },
    });
  });
  return "BOOKED";
}

/** Store and process one message. Re-delivering a message is a no-op. */
export async function ingestSms(
  scope: SmsScope,
  body: string,
  receivedAt: Date = new Date(),
): Promise<SmsOutcome> {
  const hash = smsHash(body);
  const existing = await prisma.smsMessage.findUnique({
    where: { householdId_hash: { householdId: scope.householdId, hash } },
  });
  if (existing) {
    // Seen before. If it could not be booked then, the queue re-sending it is
    // a free retry — the user may have set up the account since.
    if (existing.status === "UNMATCHED" || existing.status === "UNPARSED") {
      const outcome = await processMessage(scope, existing);
      return outcome === "BOOKED" ? "BOOKED" : "DUPLICATE";
    }
    return "DUPLICATE";
  }

  let message;
  try {
    message = await prisma.smsMessage.create({
      data: {
        householdId: scope.householdId,
        createdById: scope.userId,
        body,
        hash,
        status: "UNPARSED",
        receivedAt,
      },
    });
  } catch (e) {
    // Two deliveries of the same message racing each other.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "DUPLICATE";
    throw e;
  }
  return processMessage(scope, message);
}

export type BatchSummary = Record<Lowercase<SmsOutcome>, number> & { received: number };

/** Everything the phone had queued, in one request. */
export async function ingestSmsBatch(scope: SmsScope, body: string): Promise<BatchSummary> {
  const summary: BatchSummary = {
    received: 0,
    booked: 0,
    duplicate: 0,
    unparsed: 0,
    unmatched: 0,
    ignored: 0,
  };
  for (const text of splitSmsBatch(body)) {
    summary.received++;
    const outcome = await ingestSms(scope, text);
    summary[outcome.toLowerCase() as Lowercase<SmsOutcome>]++;
  }
  return summary;
}

/** Retry one stored message (after fixing an account's SMS number). */
export async function retrySmsMessage(scope: SmsScope, id: string): Promise<SmsOutcome | null> {
  const message = await prisma.smsMessage.findFirst({
    where: { id, householdId: scope.householdId, status: { in: ["UNMATCHED", "UNPARSED"] } },
  });
  if (!message) return null;
  return processMessage(scope, message);
}

/** Retry every message still waiting for an account — run when one is set. */
export async function retryUnmatched(scope: SmsScope): Promise<number> {
  const waiting = await prisma.smsMessage.findMany({
    where: { householdId: scope.householdId, status: "UNMATCHED" },
    orderBy: { receivedAt: "asc" },
  });
  let booked = 0;
  for (const m of waiting) {
    if ((await processMessage(scope, m)) === "BOOKED") booked++;
  }
  return booked;
}

/** How many items wait on the user: unreviewed rows + unreadable messages. */
export async function reviewCount(householdId: string): Promise<number> {
  const [rows, messages] = await Promise.all([
    prisma.transaction.count({ where: { householdId, needsReview: true } }),
    prisma.smsMessage.count({
      where: { householdId, status: { in: ["UNPARSED", "UNMATCHED"] } },
    }),
  ]);
  return rows + messages;
}
