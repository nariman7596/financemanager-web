// Central definitions for the "enum-like" string fields (SQLite has no enums)
// and the currencies the UI knows about.

export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "CREDIT_CARD",
  "INVESTMENT",
  "OTHER",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const BUDGET_PERIODS = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const ACCOUNT_SOURCES = ["MANUAL", "PLAID"] as const;
export type AccountSource = (typeof ACCOUNT_SOURCES)[number];

export const INVESTMENT_TYPES = [
  "STOCK",
  "ETF",
  "CRYPTO",
  "BOND",
  "REAL_ESTATE",
  "CASH",
  "OTHER",
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

// Currencies the app supports out of the box. `symbol` is for display.
export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "IRR", symbol: "﷼", name: "Iranian Rial" },
  // Toman is what Iranians actually quote prices in: 1 toman = 10 rial.
  // It has no ISO 4217 code, so "IRT" is the conventional stand-in and the
  // rate is derived from IRR rather than fetched (see marketdata.ts).
  { code: "IRT", symbol: "تومان", name: "Iranian Toman" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as string[];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
