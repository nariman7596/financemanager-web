import { describe, expect, it } from "vitest";
import { fromJalaliParts } from "../calendar";
import { billStatus, dueDateIn, suggestBills, type BillLike, type Payment } from "./index";

// Jalali day → Date (midnight UTC).
const j = (year: number, month: number, day: number) => new Date(fromJalaliParts({ year, month, day }) + "T00:00:00Z");
const loan = (day: Date, amount = 5_200_000): Payment => ({ day, type: "TRANSFER", amount, description: "بازپرداخت بدهی وام به‌جا", categoryId: null, transferAccountId: "loan1" });
const bill = (day: Date, amount: number, description = "پرداخت قبض تلفن همراه"): Payment => ({ day, type: "EXPENSE", amount, description, categoryId: "c-bills", transferAccountId: null });

describe("dueDateIn", () => {
  it("clamps to the month's length in the Persian calendar", () => {
    // Mehr has 30 days: a bill on the 31st falls on the 30th.
    expect(dueDateIn(j(1405, 7, 5), 31, 0, "JALALI")).toEqual(j(1405, 7, 30));
    expect(dueDateIn(j(1405, 7, 5), 12, 1, "JALALI")).toEqual(j(1405, 8, 12));
    expect(dueDateIn(j(1405, 1, 5), 12, -1, "JALALI")).toEqual(j(1404, 12, 12));
  });
});

describe("billStatus", () => {
  const b: BillLike = { amount: 5_200_000, dueDay: 12, leadDays: 3, match: { kind: "LOAN", value: "loan1" } };

  it("is due soon within the lead days, today on the day, overdue after", () => {
    expect(billStatus(b, [], j(1405, 7, 10), "JALALI")).toMatchObject({ state: "soon", days: 2 });
    expect(billStatus(b, [], j(1405, 7, 5), "JALALI")).toMatchObject({ state: "later", days: 7 });
    expect(billStatus(b, [], j(1405, 7, 12), "JALALI")).toMatchObject({ state: "today", days: 0 });
    expect(billStatus(b, [], j(1405, 7, 14), "JALALI")).toMatchObject({ state: "overdue", days: -2 });
  });

  it("is paid by a matching payment in its cycle, early or late", () => {
    expect(billStatus(b, [loan(j(1405, 7, 9))], j(1405, 7, 10), "JALALI")).toMatchObject({ state: "paid" });
    expect(billStatus(b, [loan(j(1405, 7, 15))], j(1405, 7, 16), "JALALI")).toMatchObject({ state: "paid" });
    // Last month's payment does not settle this month.
    expect(billStatus(b, [loan(j(1405, 6, 12))], j(1405, 7, 12), "JALALI").state).toBe("today");
  });

  it("moves to next month's cycle two weeks after the due date", () => {
    expect(billStatus(b, [loan(j(1405, 7, 12))], j(1405, 7, 28), "JALALI")).toMatchObject({ state: "later", due: j(1405, 8, 12) });
  });

  it("matches by description and by category within 30% of the amount", () => {
    const phone: BillLike = { amount: 350_000, dueDay: 5, leadDays: 3, match: { kind: "DESCRIPTION", value: "پرداخت قبض تلفن همراه" } };
    expect(billStatus(phone, [bill(j(1405, 7, 4), 410_000)], j(1405, 7, 6), "JALALI").state).toBe("paid");
    const gas: BillLike = { amount: 300_000, dueDay: 5, leadDays: 3, match: { kind: "CATEGORY", value: "c-bills" } };
    expect(billStatus(gas, [bill(j(1405, 7, 4), 2_000_000, "x")], j(1405, 7, 6), "JALALI").state).toBe("overdue");
    expect(billStatus(gas, [bill(j(1405, 7, 4), 320_000, "x")], j(1405, 7, 6), "JALALI").state).toBe("paid");
  });
});

describe("suggestBills", () => {
  const today = j(1405, 7, 20);
  it("finds a monthly loan instalment and a monthly bill", () => {
    const payments = [
      loan(j(1405, 5, 12)), loan(j(1405, 6, 12)), loan(j(1405, 7, 13)),
      bill(j(1405, 6, 3), 350_000), bill(j(1405, 7, 4), 380_000),
      bill(j(1405, 7, 1), 90_000, "خرید"), bill(j(1405, 7, 8), 70_000, "خرید"), // generic: never
    ];
    const got = suggestBills(payments, new Set(["loan1"]), [], today, "JALALI");
    expect(got.map((s) => [s.match.kind, s.dueDay, s.amount, s.count])).toEqual([
      ["LOAN", 12, 5_200_000, 3],
      ["DESCRIPTION", 4, 380_000, 2],
    ]);
  });
  it("skips irregular, unsteady, stale and already-known ones", () => {
    expect(suggestBills([loan(j(1405, 7, 1)), loan(j(1405, 7, 8))], new Set(["loan1"]), [], today, "JALALI")).toEqual([]);
    expect(suggestBills([bill(j(1405, 6, 3), 100_000), bill(j(1405, 7, 3), 900_000)], new Set(), [], today, "JALALI")).toEqual([]);
    expect(suggestBills([loan(j(1405, 3, 12)), loan(j(1405, 4, 12))], new Set(["loan1"]), [], today, "JALALI")).toEqual([]);
    expect(suggestBills([loan(j(1405, 6, 12)), loan(j(1405, 7, 12))], new Set(["loan1"]), [{ kind: "LOAN", value: "loan1" }], today, "JALALI")).toEqual([]);
  });
});
