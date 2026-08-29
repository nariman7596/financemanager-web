import { z } from "zod";
import {
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CATEGORY_TYPES,
  CURRENCY_CODES,
  INVESTMENT_TYPES,
  RECURRENCES,
  TRANSACTION_TYPES,
} from "../constants";

const currency = z.enum(CURRENCY_CODES as [string, ...string[]]);
const positiveAmount = z.coerce.number().positive("Amount must be greater than 0");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  baseCurrency: currency.default("USD"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency,
  openingBalance: z.coerce.number().default(0),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color").default("#328eff"),
});

export const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.string().min(1, "Choose an account"),
    categoryId: z.string().optional().nullable(),
    transferAccountId: z.string().optional().nullable(),
    amount: positiveAmount,
    currency,
    date: z.coerce.date(),
    description: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    isRecurring: z.coerce.boolean().default(false),
    recurrence: z.enum(RECURRENCES).optional().nullable(),
  })
  .refine(
    (d) => d.type !== "TRANSFER" || !!d.transferAccountId,
    { message: "Transfers need a destination account", path: ["transferAccountId"] },
  )
  .refine(
    (d) => d.type === "TRANSFER" || d.accountId !== d.transferAccountId,
    { message: "Source and destination must differ", path: ["transferAccountId"] },
  );

export const budgetSchema = z.object({
  categoryId: z.string().min(1, "Choose a category"),
  amount: positiveAmount,
  currency,
  period: z.enum(BUDGET_PERIODS).default("MONTHLY"),
});

export const investmentSchema = z.object({
  symbol: z.string().trim().min(1, "Symbol is required").max(20).toUpperCase(),
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(INVESTMENT_TYPES),
  quantity: positiveAmount,
  costBasis: z.coerce.number().nonnegative("Cost basis can't be negative"),
  currentPrice: z.coerce.number().nonnegative().default(0),
  currency,
  purchaseDate: z.coerce.date(),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: currency,
});

export const recurringSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.string().min(1, "Choose an account"),
    categoryId: z.string().optional().nullable(),
    transferAccountId: z.string().optional().nullable(),
    amount: positiveAmount,
    currency,
    description: z.string().trim().max(200).optional().nullable(),
    frequency: z.enum(RECURRENCES),
    interval: z.coerce.number().int().min(1).max(365).default(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
  })
  .refine((d) => d.type !== "TRANSFER" || !!d.transferAccountId, {
    message: "Transfers need a destination account",
    path: ["transferAccountId"],
  })
  .refine((d) => d.type === "TRANSFER" || d.accountId !== d.transferAccountId, {
    message: "Source and destination must differ",
    path: ["transferAccountId"],
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });
