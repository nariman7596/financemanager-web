import type { z } from "zod";
import type {
  accountSchema,
  budgetSchema,
  categorySchema,
  investmentSchema,
  loginSchema,
  registerSchema,
  transactionSchema,
} from "@financemanager/core/validation";

// Request shapes come straight from the schemas the server validates with, so
// the client cannot ask for something the API would reject on a field it does
// not know about.
export type RegisterInput = z.infer<typeof registerSchema> & {
  locale?: string;
  device?: DeviceInfo;
};
export type LoginInput = z.infer<typeof loginSchema> & { device?: DeviceInfo };
export type AccountInput = z.infer<typeof accountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type InvestmentInput = z.infer<typeof investmentSchema>;

export interface DeviceInfo {
  id?: string;
  platform?: "IOS" | "ANDROID" | "WEB";
  name?: string;
}

/** Fields every syncable row carries (ARCHITECTURE.md §4). */
export interface SyncEnvelope {
  id: string;
  householdId: string;
  /** Serialised as a STRING: revisions are cursors and a JSON number would
   *  lose precision above 2^53. Compare with BigInt, never with `<`. */
  revision: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Account = SyncEnvelope & AccountInput & { isArchived: boolean };
export type Category = SyncEnvelope & CategoryInput & {
  parentId: string | null;
  seedKey: string | null;
};
export type Transaction = SyncEnvelope & {
  type: string; accountId: string; categoryId: string | null;
  amount: string; currency: string; date: string;
  description: string | null; notes: string | null;
  origin: string; needsReview: boolean;
};
export type Budget = SyncEnvelope & BudgetInput;
export type Investment = SyncEnvelope & InvestmentInput;

export interface Household {
  id: string;
  name: string;
  baseCurrency: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  households: Household[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
