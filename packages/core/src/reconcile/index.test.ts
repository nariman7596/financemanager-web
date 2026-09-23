import { describe, expect, it } from "vitest";
import { reconcileAccount, type ReconcileTxn } from "./index";

let n = 0;
const tx = (over: Partial<ReconcileTxn>): ReconcileTxn => ({
  id: `t${++n}`,
  type: "EXPENSE",
  accountId: "refah",
  transferAccountId: null,
  amount: 0,
  date: new Date("2026-09-23T00:00:00Z"),
  createdAt: new Date(`2026-09-23T10:00:${String(n).padStart(2, "0")}Z`),
  bankBalance: null,
  ...over,
});

describe("reconcileAccount", () => {
  it("finds the Paya fee the bank never sent an SMS for", () => {
    // The owner's real Refah messages, in toman: a purchase leaving 7,045,710.5,
    // then a 7,000,000 Paya — but the bank reported 45,010.5, not 45,710.5.
    const txns = [
      tx({ amount: 1_906_000, bankBalance: 7_045_710.5, date: new Date("2026-09-22T00:00:00Z") }),
      tx({ amount: 7_000_000, bankBalance: 45_010.5 }),
    ];
    const r = reconcileAccount("refah", 8_951_710.5, txns);
    expect(r).toMatchObject({ bankBalance: 45_010.5, appBalance: 45_710.5, gap: -700 });
  });

  it("finds a wrong opening balance", () => {
    const txns = [tx({ type: "INCOME", amount: 7_000_000, bankBalance: 1_408_252_615.5 })];
    expect(reconcileAccount("blu", 7_402_616, txns.map((t) => ({ ...t, accountId: "blu" })))?.gap)
      .toBeCloseTo(1_393_850_000 - 0.5, 0);
  });

  it("is zero when the books agree, within rounding", () => {
    const txns = [tx({ amount: 100, bankBalance: 900.4 })];
    expect(reconcileAccount("refah", 1000, txns)?.gap).toBe(0);
  });

  it("counts transfers on both sides and ignores other accounts", () => {
    const txns = [
      tx({ type: "TRANSFER", accountId: "blu", transferAccountId: "refah", amount: 500 }),
      tx({ accountId: "melli", amount: 99 }),
      tx({ amount: 100, bankBalance: 1400 }),
    ];
    expect(reconcileAccount("refah", 1000, txns)).toMatchObject({ appBalance: 1400, gap: 0 });
  });

  it("compares at the latest SMS balance, not at today's total", () => {
    const txns = [
      tx({ amount: 100, bankBalance: 900 }),
      // Recorded by hand afterwards, no bank balance: must not create a gap.
      tx({ amount: 50 }),
    ];
    expect(reconcileAccount("refah", 1000, txns)).toMatchObject({ appBalance: 900, gap: 0 });
  });

  it("is null when no SMS has carried a balance", () => {
    expect(reconcileAccount("refah", 1000, [tx({ amount: 5 })])).toBeNull();
  });
});
