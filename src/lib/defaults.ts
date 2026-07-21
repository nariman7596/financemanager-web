import { prisma } from "./prisma";

// Default categories and a starter account created for every new user so the
// app is usable immediately after sign-up.

export const DEFAULT_CATEGORIES: {
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}[] = [
  { name: "Salary", type: "INCOME", color: "#16a34a" },
  { name: "Business", type: "INCOME", color: "#0ea5e9" },
  { name: "Investments", type: "INCOME", color: "#8b5cf6" },
  { name: "Other Income", type: "INCOME", color: "#22c55e" },
  { name: "Housing", type: "EXPENSE", color: "#ef4444" },
  { name: "Groceries", type: "EXPENSE", color: "#f97316" },
  { name: "Transport", type: "EXPENSE", color: "#eab308" },
  { name: "Utilities", type: "EXPENSE", color: "#06b6d4" },
  { name: "Dining", type: "EXPENSE", color: "#ec4899" },
  { name: "Health", type: "EXPENSE", color: "#14b8a6" },
  { name: "Entertainment", type: "EXPENSE", color: "#a855f7" },
  { name: "Shopping", type: "EXPENSE", color: "#f43f5e" },
  { name: "Other", type: "EXPENSE", color: "#64748b" },
];

export async function seedDefaultsForUser(userId: string, currency: string) {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
  });

  await prisma.account.create({
    data: {
      userId,
      name: "Cash",
      type: "CASH",
      currency,
      openingBalance: 0,
    },
  });
}
