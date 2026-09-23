import * as jalali from "date-fns-jalali";

/**
 * Reading Iranian bank SMS into transactions.
 *
 * iOS lets no app read messages, so the phone forwards each bank SMS to the
 * server (an iOS Shortcuts automation, see docs/SMS.md) and this turns the raw
 * text into something the app can book. Everything here is pure: parsing,
 * matching a message to an account, and working out the date.
 *
 * Banks differ in wording but share a shape: one fact per line, a label glued
 * to its value, amounts in rial with a sign for direction, and a Jalali
 * month/day with no year. Bank Refah, for example:
 *
 *   بانک رفاه
 *   حساب405943623
 *   پایا70,000,000-
 *   مانده450,105
 *   07/01-11:32
 *
 * The parser reads by those shapes rather than by bank, so a new bank usually
 * needs no code. What it cannot read is returned as null, never guessed: a
 * wrong amount booked silently is worse than a message left for the user.
 */

export type SmsDirection = "IN" | "OUT";

export type ParsedSms = {
  /** First line naming the bank, e.g. "بانک رفاه", if present. */
  bank: string | null;
  /** Account or card reference as printed (digits, may carry * masking). */
  accountRef: string | null;
  direction: SmsDirection;
  /** Always positive, in rial as the bank reports it. */
  amountRial: number;
  /** The balance the bank reports after this transaction, in rial. */
  balanceRial: number | null;
  /** The label on the amount line, e.g. "پایا", "خرید", "برداشت". */
  kind: string | null;
  /** A free-text line the bank adds, e.g. "حقوق ماهانه" on a salary deposit. */
  note: string | null;
  /** Midnight UTC of the transaction's calendar day (the app's date convention). */
  date: Date;
  /** "HH:MM" if the message carried a time. */
  time: string | null;
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Canonical form of a message: ASCII digits, no bidi control marks, unified
 * separators, trimmed lines. Used both to parse and to recognise a message
 * that arrives twice, so the same SMS always normalises to the same text.
 */
export function normalizeSms(text: string): string {
  let out = "";
  for (const ch of text) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    const a = ARABIC_DIGITS.indexOf(ch);
    if (p >= 0) out += String(p);
    else if (a >= 0) out += String(a);
    else if (ch === "٬") out += ","; // Arabic thousands separator
    else if (ch === "٫") out += "."; // Arabic decimal separator
    // Arabic letter forms some bank gateways send ("بانك", "واريز"): fold to
    // Persian so word matching sees one spelling.
    else if (ch === "ك") out += "ک";
    else if (ch === "ي" || ch === "ى") out += "ی";
    else if (/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(ch)) continue;
    else out += ch;
  }
  return out
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// Words that name the direction when a bank does not use a sign.
const OUT_WORDS = ["برداشت", "خرید", "کسر", "انتقال از", "پرداخت", "کارمزد", "قسط"];
const IN_WORDS = ["واریز", "انتقال به", "سود", "افزایش", "برگشت", "بستانکار"];
const BALANCE_WORDS = ["مانده", "موجودی"];
const ACCOUNT_WORDS = ["حساب", "کارت", "سپرده", "شماره"];

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+|\d+`;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function hasAny(line: string, words: string[]): boolean {
  return words.some((w) => line.includes(w));
}

function parseAmountLine(line: string): {
  amount: number;
  sign: "+" | "-" | null;
  label: string;
} | null {
  // label, then a number with its sign either side: "پایا70,000,000-",
  // "برداشت: -1,200,000 ریال", "واریز +500,000".
  const m = line.match(
    new RegExp(String.raw`^(.*?)[:：]?\s*([+-])?\s*(${NUMBER})\s*([+-])?\s*(?:ریال|rial)?$`, "i"),
  );
  if (!m) return null;
  const [, rawLabel, lead, num, trail] = m;
  const amount = toNumber(num);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const sign = (lead ?? trail ?? null) as "+" | "-" | null;
  return { amount, sign, label: rawLabel.replace(/[:：]\s*$/, "").trim() };
}

/** Jalali y/m/d → midnight UTC of the same Gregorian day. */
export function jalaliToUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const local = jalali.newDate(year, month - 1, day);
  if (Number.isNaN(local.getTime())) return null;
  // Reject overflow (e.g. 30 Esfand in a common year rolling into Farvardin).
  if (jalali.getDate(local) !== day || jalali.getMonth(local) !== month - 1) return null;
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** Today's Jalali date in Iran (UTC+03:30, no DST since 2022). */
export function tehranJalaliToday(now: Date): { year: number; month: number; day: number } {
  const t = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
  const local = new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return {
    year: jalali.getYear(local),
    month: jalali.getMonth(local) + 1,
    day: jalali.getDate(local),
  };
}

function parseDate(lines: string[], now: Date): { date: Date; time: string | null } | null {
  for (const line of lines) {
    // Year optional and of any width: Refah alone sends "07/01", "5/07/01"
    // and "1405/07/01". A 1-digit year must be read as the year, not as the
    // month — "5/07/01" is 1 Mehr 1405, not 7 Mordad.
    const d = line.match(/(?:(\d{1,4})\/)?(\d{1,2})\/(\d{1,2})(?!\d)/);
    if (!d) continue;
    const time = line.match(/(\d{1,2}):(\d{2})/);
    const month = Number(d[2]);
    const day = Number(d[3]);
    const today = tehranJalaliToday(now);

    let date: Date | null;
    if (d[1]) {
      let year = Number(d[1]);
      if (year < 100) year += 1400; // "5/07/01", "05/07/01" → 1405
      date = jalaliToUtcDate(year, month, day);
    } else {
      // No year: this year, unless that would be in the future — a message
      // for 29 Esfand read on 1 Farvardin belongs to last year.
      date = jalaliToUtcDate(today.year, month, day);
      const todayUtc = jalaliToUtcDate(today.year, today.month, today.day);
      if (date && todayUtc && date.getTime() > todayUtc.getTime() + 24 * 60 * 60 * 1000) {
        date = jalaliToUtcDate(today.year - 1, month, day);
      }
    }
    if (!date) continue;
    return {
      date,
      time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null,
    };
  }
  return null;
}

/**
 * Parse one bank SMS. Returns null when the message has no readable amount or
 * direction — for example an OTP or an advertisement from the same sender.
 */
export function parseBankSms(text: string, now: Date = new Date()): ParsedSms | null {
  const lines = normalizeSms(text).split("\n");
  if (lines.length === 0) return null;

  const bank = lines.find((l) => l.includes("بانک")) ?? null;

  let accountRef: string | null = null;
  let balanceRial: number | null = null;
  let amount: { amount: number; sign: "+" | "-" | null; label: string } | null = null;
  let note: string | null = null;

  for (const line of lines) {
    if (line.includes("/") && /\d\/\d/.test(line)) continue; // the date line

    if (hasAny(line, BALANCE_WORDS)) {
      const n = line.match(new RegExp(NUMBER));
      if (n && balanceRial === null) balanceRial = toNumber(n[0]);
      continue;
    }

    if (!accountRef && hasAny(line, ACCOUNT_WORDS)) {
      const ref = line.match(/[\d*]{4,}(?:[-.][\d*]+)*/);
      if (ref) {
        accountRef = ref[0];
        continue;
      }
    }

    if (!amount) {
      const a = parseAmountLine(line);
      if (a && (a.sign || hasAny(a.label, OUT_WORDS) || hasAny(a.label, IN_WORDS))) {
        amount = a;
        continue;
      }
    }

    // A digit-free line after the amount is the bank's own description.
    if (amount && !note && !/\d/.test(line) && line !== bank) note = line;
  }

  if (!amount) return null;

  let direction: SmsDirection | null = null;
  if (amount.sign === "-") direction = "OUT";
  else if (amount.sign === "+") direction = "IN";
  else if (hasAny(amount.label, OUT_WORDS)) direction = "OUT";
  else if (hasAny(amount.label, IN_WORDS)) direction = "IN";
  if (!direction) return null;

  const when = parseDate(lines, now);
  if (!when) return null;

  return {
    bank,
    accountRef,
    direction,
    amountRial: amount.amount,
    balanceRial,
    kind: amount.label || null,
    note,
    date: when.date,
    time: when.time,
  };
}

/**
 * Whether an unreadable message still looks like money moved — a signed or
 * thousands-separated amount, or a direction word. Banks also send login
 * notices, OTPs and adverts from the same sender; those are not worth the
 * user's attention, while an unreadable transaction is.
 */
export function looksLikeTransaction(text: string): boolean {
  const lines = normalizeSms(text).split("\n");
  return lines.some((line) => {
    if (/\d\/\d/.test(line) || hasAny(line, BALANCE_WORDS)) return false;
    return (
      /\d{1,3}(?:,\d{3})+/.test(line) ||
      /[+-]\s*\d{4,}|\d{4,}\s*[+-]/.test(line) ||
      ((hasAny(line, OUT_WORDS) || hasAny(line, IN_WORDS)) && /\d/.test(line))
    );
  });
}

/**
 * Pick the account an SMS belongs to. Each account stores the number its bank
 * prints (`smsMatch`); a message matches when the trailing digits agree for at
 * least four digits — banks often mask the start ("****1234") or print only an
 * account where the user stored the card, or vice versa.
 */
export function matchSmsAccount<T extends { id: string; smsMatch: string | null }>(
  accountRef: string | null,
  accounts: T[],
): T | null {
  if (!accountRef) return null;
  const ref = accountRef.match(/(\d+)\D*$/)?.[1] ?? "";
  if (ref.length < 4) return null;
  const hits = accounts.filter((a) => {
    const own = (a.smsMatch ?? "").replace(/\D/g, "");
    if (own.length < 4) return false;
    return own.endsWith(ref) || ref.endsWith(own);
  });
  // Ambiguous is as bad as unknown: never guess which account the money left.
  return hits.length === 1 ? hits[0] : null;
}

/** Rial amount in the account's own currency (toman is exactly 10 rial). */
export function rialTo(currency: string, rial: number): { amount: number; currency: string } {
  if (currency === "IRT") return { amount: rial / 10, currency: "IRT" };
  return { amount: rial, currency: "IRR" };
}

/**
 * Several messages in one request, as the iOS shortcut sends them when it
 * catches up on everything queued while the phone was away from home.
 */
export const SMS_BATCH_SEPARATOR = "~~~fm~~~";

export function splitSmsBatch(body: string): string[] {
  return body
    .split(SMS_BATCH_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
