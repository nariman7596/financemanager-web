import bcrypt from "bcryptjs";
import { seedDefaultCategories } from "../src/defaults";


// The SHARED client, not a fresh PrismaClient: a client built here would
// bypass the field-encryption extension and write descriptions to disk in
// plain text. That is exactly what it did until someone looked at the table.
import { prisma } from "../src/client";

// Starter FX rates (quote per 1 base). Approximate — a real deployment refreshes
// these from an FX API. Enough to make multi-currency work offline.
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
  for (const r of RATES) {
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: r.base, quote: r.quote } },
      create: r,
      update: { rate: r.rate },
    });
  }

  const email = "demo@financemanager.app";
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("Demo user already exists — skipping sample data.");
    console.log("Exchange rates refreshed.");
    return;
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const demo = await prisma.user.create({
    data: { email, name: "Demo User", baseCurrency: "USD", passwordHash },
  });
  // A second user, added to the household as a MEMBER, to show roles.
  const partner = await prisma.user.create({
    data: {
      email: "partner@financemanager.app",
      name: "Partner",
      baseCurrency: "USD",
      passwordHash,
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "Demo Household",
      baseCurrency: "USD",
      members: {
        create: [
          { userId: demo.id, role: "OWNER" },
          { userId: partner.id, role: "MEMBER" },
        ],
      },
    },
  });
  const hid = household.id;

  // Same tree the app creates for a real household — including sub-categories
  // and seedKey — rather than a second, flat copy that drifts.
  await seedDefaultCategories(hid, "en", demo.id);
  const cats = await prisma.category.findMany({ where: { householdId: hid } });
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  const checking = await prisma.account.create({
    data: { householdId: hid, createdById: demo.id, name: "Main Checking", type: "CHECKING", currency: "USD", openingBalance: 3200 },
  });
  const savings = await prisma.account.create({
    data: { householdId: hid, createdById: demo.id, name: "Savings", type: "SAVINGS", currency: "USD", openingBalance: 12000 },
  });

  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return d;
  };

  await prisma.transaction.createMany({
    data: [
      { householdId: hid, createdById: demo.id, accountId: checking.id, categoryId: cat("Salary"), type: "INCOME", amount: 5200, currency: "USD", date: day(20), description: "Monthly salary" },
      { householdId: hid, createdById: demo.id, accountId: checking.id, categoryId: cat("Housing"), type: "EXPENSE", amount: 1500, currency: "USD", date: day(18), description: "Rent" },
      { householdId: hid, createdById: partner.id, accountId: checking.id, categoryId: cat("Groceries"), type: "EXPENSE", amount: 240, currency: "USD", date: day(15), description: "Supermarket" },
      { householdId: hid, createdById: partner.id, accountId: checking.id, categoryId: cat("Transport"), type: "EXPENSE", amount: 90, currency: "USD", date: day(12), description: "Fuel" },
      { householdId: hid, createdById: demo.id, accountId: checking.id, categoryId: cat("Dining"), type: "EXPENSE", amount: 120, currency: "USD", date: day(9), description: "Restaurants" },
      { householdId: hid, createdById: demo.id, accountId: checking.id, categoryId: cat("Utilities"), type: "EXPENSE", amount: 180, currency: "USD", date: day(7), description: "Electricity + internet" },
      { householdId: hid, createdById: partner.id, accountId: checking.id, categoryId: cat("Entertainment"), type: "EXPENSE", amount: 45, currency: "USD", date: day(5), description: "Streaming" },
      { householdId: hid, createdById: demo.id, accountId: checking.id, transferAccountId: savings.id, type: "TRANSFER", amount: 800, currency: "USD", date: day(3), description: "To savings" },
    ],
  });

  await prisma.budget.createMany({
    data: [
      { householdId: hid, categoryId: cat("Groceries"), amount: 500, currency: "USD", period: "MONTHLY" },
      { householdId: hid, categoryId: cat("Dining"), amount: 200, currency: "USD", period: "MONTHLY" },
      { householdId: hid, categoryId: cat("Transport"), amount: 150, currency: "USD", period: "MONTHLY" },
      { householdId: hid, categoryId: cat("Entertainment"), amount: 100, currency: "USD", period: "MONTHLY" },
    ],
  });

  await prisma.investment.createMany({
    data: [
      { householdId: hid, createdById: demo.id, symbol: "AAPL", name: "Apple Inc.", type: "STOCK", quantity: 15, costBasis: 2400, currentPrice: 195, currency: "USD", purchaseDate: day(200) },
      { householdId: hid, createdById: demo.id, symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", quantity: 10, costBasis: 4200, currentPrice: 480, currency: "USD", purchaseDate: day(150) },
      { householdId: hid, createdById: demo.id, symbol: "BTC", name: "Bitcoin", type: "CRYPTO", quantity: 0.15, costBasis: 6000, currentPrice: 62000, currency: "USD", purchaseDate: day(90) },
    ],
  });

  console.log("Seeded demo household:");
  console.log("  OWNER   demo@financemanager.app    / demo1234");
  console.log("  MEMBER  partner@financemanager.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
