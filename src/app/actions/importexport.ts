"use server";

import { revalidatePath } from "next/cache";
import { checkHousehold } from "@/lib/household";
import {
  importTransactionsForHousehold,
  MAX_BYTES,
  type ImportResult,
} from "@/lib/importer";

export type { ImportResult } from "@/lib/importer";

const empty: ImportResult = {
  imported: 0,
  skipped: 0,
  createdAccounts: 0,
  createdCategories: 0,
  errors: [],
};

export async function importTransactions(
  formData: FormData,
): Promise<ImportResult> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { ...empty, error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...empty, error: "Choose a CSV file to import" };
  }
  if (file.size > MAX_BYTES) {
    return { ...empty, error: "File is too large (max 5 MB)" };
  }

  const result = await importTransactionsForHousehold(
    ctx.householdId,
    await file.text(),
    ctx.userId,
  );

  if (result.imported > 0) {
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    revalidatePath("/budgets");
    revalidatePath("/accounts");
  }
  return result;
}
