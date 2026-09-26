import { describe, expect, it } from "vitest";
import { parseSmsOtp, suggestCategory, transferHistory, type SuggestHistoryItem } from "./index";

const D = (iso: string) => new Date(iso + "T00:00:00Z");

const past = (over: Partial<SuggestHistoryItem>): SuggestHistoryItem => ({
  type: "EXPENSE",
  accountId: "refah",
  amount: 100_000,
  currency: "IRT",
  description: null,
  date: D("2026-09-01"),
  categoryId: "misc",
  ...over,
});

const target = (over: Partial<SuggestHistoryItem> = {}) => ({
  type: "EXPENSE",
  accountId: "refah",
  amount: 100_000,
  currency: "IRT",
  description: null,
  date: D("2026-09-23"),
  ...over,
});

describe("suggestCategory", () => {
  it("learns salary from the bank's note", () => {
    const history = [past({ type: "INCOME", description: "حقوق ماهانه", amount: 250_000_000, categoryId: "salary" })];
    expect(
      suggestCategory(target({ type: "INCOME", description: "حقوق ماهانه", amount: 274_551_390 }), history),
    ).toMatchObject({ categoryId: "salary" });
  });

  it("learns a repeating amount, like an installment", () => {
    const history = [
      past({ amount: 4_500_000, description: "پایا", categoryId: "installments", date: D("2026-08-23") }),
      past({ amount: 4_500_000, description: "پایا", categoryId: "installments", date: D("2026-07-23") }),
    ];
    expect(suggestCategory(target({ amount: 4_500_000, description: "پایا" }), history)).toMatchObject({
      categoryId: "installments",
    });
  });

  it("learns a merchant carried over from the OTP", () => {
    const history = [past({ accountId: "blu", currency: "IRR", description: "ازکی", amount: 3_000_000, categoryId: "insurance" })];
    expect(
      suggestCategory(target({ accountId: "blu", currency: "IRR", description: "ازکي", amount: 4_871_050 }), history),
    ).toMatchObject({ categoryId: "insurance" });
  });

  it("does not guess when a generic word matches many categories", () => {
    const history = [
      past({ description: "خرید", amount: 120_000, categoryId: "groceries" }),
      past({ description: "خرید", amount: 900_000, categoryId: "clothes" }),
      past({ description: "خرید", amount: 45_000, categoryId: "dining" }),
    ];
    expect(suggestCategory(target({ description: "خرید", amount: 300_000 }), history)).toBeNull();
  });

  it("lets recent choices outweigh old ones", () => {
    const history = [
      past({ description: "خرید", amount: 300_000, categoryId: "old", date: D("2025-09-23") }),
      past({ description: "خرید", amount: 300_000, categoryId: "new", date: D("2026-09-20") }),
      past({ description: "خرید", amount: 300_000, categoryId: "new", date: D("2026-09-10") }),
    ];
    expect(suggestCategory(target({ description: "خرید", amount: 300_000 }), history)?.categoryId).toBe("new");
  });

  it("ignores other types, other currencies' amounts, and no history", () => {
    expect(suggestCategory(target(), [])).toBeNull();
    expect(suggestCategory(target({ description: "x" }), [past({ type: "INCOME", description: "x" })])).toBeNull();
    // Same number, different currency: not the same amount.
    expect(suggestCategory(target(), [past({ currency: "IRR" })])).toBeNull();
  });
});

describe("parseSmsOtp", () => {
  it("reads the amount and merchant from Blu's purchase OTP", () => {
    const otp = "بلو\nبفرمایید رمز پویا\nخرید\nازکي\nمبلغ: 4,871,050 ریال\nرمز: 806534\n22:26";
    expect(parseSmsOtp(otp)).toEqual({ amountRial: 4_871_050, merchant: "ازکی" });
  });

  it("is null for anything that is not an OTP", () => {
    expect(parseSmsOtp("بانک رفاه\nحساب405943623\nخرید19,060,000-\n06/31-21:38")).toBeNull();
  });
});

describe("transferHistory", () => {
  const d = (s: string) => new Date(s + "T00:00:00Z");
  const bank = "bank";
  const broker = "broker";
  const sms = new Set([bank]);

  it("learns a broker payout filed as a transfer, and suggests it next time", () => {
    const history = transferHistory(
      [{ accountId: broker, transferAccountId: bank, amount: 100_000_000, currency: "IRT", description: "واریز پایا کارگزاری مفید", date: d("2026-09-20") }],
      sms,
    );
    expect(history).toEqual([
      expect.objectContaining({ type: "INCOME", accountId: bank, categoryId: "transfer:broker" }),
    ]);
    const s = suggestCategory(
      { type: "INCOME", accountId: bank, amount: 40_000_000, currency: "IRT", description: "واریز پایا کارگزاری مفید", date: d("2026-09-26") },
      history,
    );
    expect(s?.categoryId).toBe("transfer:broker");
  });

  it("reads money out of the SMS account as a transfer to the other side", () => {
    expect(
      transferHistory([{ accountId: bank, transferAccountId: broker, amount: 5, currency: "IRT", description: null, date: d("2026-09-20") }], sms),
    ).toEqual([expect.objectContaining({ type: "EXPENSE", accountId: bank, categoryId: "transfer:broker" })]);
  });

  it("skips transfers where either both or neither side receives SMS", () => {
    const both = new Set([bank, broker]);
    const row = { accountId: bank, transferAccountId: broker, amount: 5, currency: "IRT", description: null, date: d("2026-09-20") };
    expect(transferHistory([row], both)).toEqual([]);
    expect(transferHistory([row], new Set())).toEqual([]);
    expect(transferHistory([{ ...row, transferAccountId: null }], sms)).toEqual([]);
  });
});
