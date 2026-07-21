import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_CATEGORIES } from "../src/lib/defaults";

const prisma = new PrismaClient();

// Starter FX rates (quote per 1 base). Approximate — a real deployment would
// refresh these from an FX API. Enough to make multi-currency work offline.
const RATES: { base: string; quote: string; rate: number }[] = [
  { base: "USD", quote: "EUR", rate: 0.92 },
  { base: "USD", quote: "GBP", rate: 0.79 },
  { base: "USD", quote: "JPY", rate: 157 },
  { base: "USD", quote: "CAD", rate: 1.37 },
  { base: "USD", quote: "AUD", rate: 1.52 },
  { base: "USD", quote: "CHF", rate: 0.9 },
  { base: "USD", quote: "CNY", rate: 7.24 },
  { base: "USD", quote: "AED", rate: 3.67 },
  { base: "USD", quote: "IRR", rate: 42000 },
  { base: "USD", quote: "TRY", rate: 32.5 },
  { base: "USD", quote: "INR", rate: 83.3 },
];

async function main() {
  // Exchange rates (idempotent).
  for (const r of RATES) {
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: r.base, quote: r.quote } },
      create: r,
      update: { rate: r.rate },
    });
  }

  // Demo user — email: demo@financemanager.app / password: demo1234
  const email = "demo@financemanager.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo user already exists — skipping sample data.");
    console.log("Exchange rates refreshed.");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo User",
      baseCurrency: "USD",
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
  });
  const cats = await prisma.category.findMany({ where: { userId: user.id } });
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  const checking = await prisma.account.create({
    data: { userId: user.id, name: "Main Checking", type: "CHECKING", currency: "USD", openingBalance: 3200 },
  });
  const savings = await prisma.account.create({
    data: { userId: user.id, name: "Savings", type: "SAVINGS", currency: "USD", openingBalance: 12000 },
  });

  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return d;
  };

  await prisma.transaction.createMany({
    data: [
      { userId: user.id, accountId: checking.id, categoryId: cat("Salary"), type: "INCOME", amount: 5200, currency: "USD", date: day(20), description: "Monthly salary" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Housing"), type: "EXPENSE", amount: 1500, currency: "USD", date: day(18), description: "Rent" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Groceries"), type: "EXPENSE", amount: 240, currency: "USD", date: day(15), description: "Supermarket" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Transport"), type: "EXPENSE", amount: 90, currency: "USD", date: day(12), description: "Fuel" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Dining"), type: "EXPENSE", amount: 120, currency: "USD", date: day(9), description: "Restaurants" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Utilities"), type: "EXPENSE", amount: 180, currency: "USD", date: day(7), description: "Electricity + internet" },
      { userId: user.id, accountId: checking.id, categoryId: cat("Entertainment"), type: "EXPENSE", amount: 45, currency: "USD", date: day(5), description: "Streaming" },
      { userId: user.id, accountId: checking.id, transferAccountId: savings.id, type: "TRANSFER", amount: 800, currency: "USD", date: day(3), description: "To savings" },
    ],
  });

  await prisma.budget.createMany({
    data: [
      { userId: user.id, categoryId: cat("Groceries"), amount: 500, currency: "USD", period: "MONTHLY" },
      { userId: user.id, categoryId: cat("Dining"), amount: 200, currency: "USD", period: "MONTHLY" },
      { userId: user.id, categoryId: cat("Transport"), amount: 150, currency: "USD", period: "MONTHLY" },
      { userId: user.id, categoryId: cat("Entertainment"), amount: 100, currency: "USD", period: "MONTHLY" },
    ],
  });

  await prisma.investment.createMany({
    data: [
      { userId: user.id, symbol: "AAPL", name: "Apple Inc.", type: "STOCK", quantity: 15, costBasis: 2400, currentPrice: 195, currency: "USD", purchaseDate: day(200) },
      { userId: user.id, symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", quantity: 10, costBasis: 4200, currentPrice: 480, currency: "USD", purchaseDate: day(150) },
      { userId: user.id, symbol: "BTC", name: "Bitcoin", type: "CRYPTO", quantity: 0.15, costBasis: 6000, currentPrice: 62000, currency: "USD", purchaseDate: day(90) },
    ],
  });

  console.log("Seeded demo user:  demo@financemanager.app  /  demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
