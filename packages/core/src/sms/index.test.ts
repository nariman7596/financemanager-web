import { describe, expect, it } from "vitest";
import {
  jalaliToUtcDate,
  looksLikeTransaction,
  matchSmsAccount,
  normalizeSms,
  normalizeSmsMatch,
  parseBankSms,
  rialTo,
  splitSmsBatch,
  SMS_BATCH_SEPARATOR,
} from "./index";

// 2026-09-23 12:00 UTC = 1 Mehr 1405, 15:30 in Tehran.
const NOW = new Date("2026-09-23T12:00:00Z");

// A real Bank Refah message (account number as sent by the owner).
const REFAH_PAYA = "بانک رفاه\nحساب405943623\nپایا70,000,000-\nمانده450,105\n07/01-11:32";

describe("parseBankSms", () => {
  it("reads a Bank Refah withdrawal", () => {
    expect(parseBankSms(REFAH_PAYA, NOW)).toEqual({
      bank: "بانک رفاه",
      accountRef: "405943623",
      direction: "OUT",
      amountRial: 70_000_000,
      balanceRial: 450_105,
      kind: "پایا",
      note: null,
      date: new Date("2026-09-23T00:00:00Z"), // 1 Mehr 1405
      time: "11:32",
    });
  });

  // Real Bank Refah messages, typed from the owner's phone.
  it("reads a Refah purchase from the previous month", () => {
    const sms = "بانک رفاه\nحساب405943623\nخرید19,060,000-\nمانده70,457,105\n06/31-21:38";
    expect(parseBankSms(sms, NOW)).toMatchObject({
      direction: "OUT",
      amountRial: 19_060_000,
      balanceRial: 70_457_105,
      kind: "خرید",
      date: new Date("2026-09-22T00:00:00Z"), // 31 Shahrivar 1405
      time: "21:38",
    });
  });

  it("reads a Refah salary: Arabic letters, a note line and a 1-digit year", () => {
    // "بانك" with Arabic kaf, and "5/07/01" = 1 Mehr 1405 — not 7 Mordad.
    const sms = "بانك رفاه\nحساب 405943623\nواریز2,745,513,902+\nحقوق ماهانه\nمانده2,745,964,007\n5/07/01-13:00";
    expect(parseBankSms(sms, NOW)).toEqual({
      bank: "بانک رفاه",
      accountRef: "405943623",
      direction: "IN",
      amountRial: 2_745_513_902,
      balanceRial: 2_745_964_007,
      kind: "واریز",
      note: "حقوق ماهانه",
      date: new Date("2026-09-23T00:00:00Z"),
      time: "13:00",
    });
  });

  // Real Blu messages: a sentence, no account number, dotted date, time apart.
  const BLU_IN =
    "بلو\nواریز پول\nعبدالرضا عزیز، 70,000,000 ریال به حساب شما نشست.\nموجودی: 14,082,526,155 ریال\n۱۳:۵۱\n۱۴۰۵.۰۷.۰۱";
  const BLU_OUT =
    "بلو\nبرداشت پول\nعبدالرضا عزیز، 1,000,000 ریال از حساب شما پرید.\nموجودی: 14,012,526,155 ریال\n۱۲:۳۳\n۱۴۰۵.۰۷.۰۱";

  it("reads a Blu deposit written as a sentence", () => {
    expect(parseBankSms(BLU_IN, NOW)).toEqual({
      bank: "بلو",
      accountRef: null,
      direction: "IN",
      amountRial: 70_000_000,
      balanceRial: 14_082_526_155,
      kind: "واریز پول",
      note: null,
      date: new Date("2026-09-23T00:00:00Z"),
      time: "13:51",
    });
  });

  it("reads a Blu withdrawal", () => {
    expect(parseBankSms(BLU_OUT, NOW)).toMatchObject({
      direction: "OUT",
      amountRial: 1_000_000,
      balanceRial: 14_012_526_155,
      time: "12:33",
    });
  });

  it("does not take a comma-less rial amount for an account number", () => {
    const p = parseBankSms("بلو\nعبدالرضا عزیز، 70000000 ریال به حساب شما نشست.\n1405.07.01", NOW);
    expect(p).toMatchObject({ accountRef: null, amountRial: 70_000_000, direction: "IN" });
  });

  // Real Blu messages: the "بابت …" purpose becomes the description. The loan
  // instalment has no header line at all, so without it the row had none.
  it("takes the purpose after بابت as the description", () => {
    const bill = parseBankSms(
      "بلو\nپرداخت قبض\nعبدالرضا عزیز، 578,000 ریال بابت پرداخت قبض تلفن همراه از حساب شما پرید.\nموجودی: 14,902,340,335 ریال\n۵:۰۹\n۱۴۰۵.۰۷.۰۲",
      NOW,
    );
    expect(bill).toMatchObject({
      direction: "OUT",
      amountRial: 578_000,
      kind: "پرداخت قبض",
      note: "پرداخت قبض تلفن همراه",
      balanceRial: 14_902_340_335,
    });
    const loan = parseBankSms(
      "بلو\nعبدالرضا عزیز 23,158,626 ریال بابت بازپرداخت بدهی وام به‌جا، از حساب شما پرید.\nموجودی: 14,878,501,709 ریال\n۵:۴۲\n۱۴۰۵.۰۷.۰۲",
      NOW,
    );
    expect(loan).toMatchObject({ direction: "OUT", amountRial: 23_158_626, note: "بازپرداخت بدهی وام به‌جا" });
  });

  it("refuses a sentence that says both in and out", () => {
    expect(parseBankSms("بلو\n500,000 ریال از حساب شما به حساب شما\n1405.07.01", NOW)).toBeNull();
  });

  it("reads a direction word spelled with Arabic ya", () => {
    const p = parseBankSms("حساب1234567\nواريز 300,000\n07/01", NOW);
    expect(p?.direction).toBe("IN");
  });

  it("reads a deposit by its trailing plus sign", () => {
    const sms = "بانک رفاه\nحساب405943623\nواریز5,000,000+\nمانده5,450,105\n07/01-12:10";
    const p = parseBankSms(sms, NOW);
    expect(p?.direction).toBe("IN");
    expect(p?.amountRial).toBe(5_000_000);
    expect(p?.kind).toBe("واریز");
  });

  it("accepts Persian digits, bidi marks and a spaced, labelled layout", () => {
    const sms = "‏بانک ملت\nکارت: ****۱۲۳۴\nبرداشت: ۱٬۲۰۰٬۰۰۰ ریال\nموجودی: ۹۸۰٬۰۰۰\n۱۴۰۵/۰۶/۳۱ ۰۹:۰۵";
    const p = parseBankSms(sms, NOW);
    expect(p).toMatchObject({
      accountRef: "****1234",
      direction: "OUT",
      amountRial: 1_200_000,
      balanceRial: 980_000,
      time: "09:05",
    });
    expect(p?.date).toEqual(new Date("2026-09-22T00:00:00Z")); // 31 Shahrivar 1405
  });

  it("takes the direction from the wording when there is no sign", () => {
    const p = parseBankSms("انتقال به حساب\nحساب 1234567\nواریز 300,000\n07/01", NOW);
    expect(p?.direction).toBe("IN");
  });

  it("puts a date that would be in the future into last year", () => {
    // Read on 1 Farvardin 1406 (2027-03-21), a message dated 29 Esfand.
    const p = parseBankSms("حساب1234567\nخرید100,000-\n12/29-23:50", new Date("2027-03-21T08:00:00Z"));
    expect(p?.date).toEqual(jalaliToUtcDate(1405, 12, 29));
  });

  it("returns null for messages that are not transactions", () => {
    expect(parseBankSms("رمز پویا: 482913\nاعتبار 2 دقیقه", NOW)).toBeNull();
    expect(parseBankSms("بانک رفاه\nجشنواره قرعه کشی حساب های سپرده", NOW)).toBeNull();
    // A number with no sign and no direction word is not guessed.
    expect(parseBankSms("حساب405943623\nمبلغ70,000,000\n07/01", NOW)).toBeNull();
    // No date: refuse rather than book it on the wrong day.
    expect(parseBankSms("حساب405943623\nپایا70,000,000-", NOW)).toBeNull();
  });
});

describe("looksLikeTransaction", () => {
  it("is false for the notices banks send from the same number", () => {
    // Refah's mobile-bank login notice, and an OTP: never worth a review item.
    expect(looksLikeTransaction("بانک رفاه\nمشتری گرامی\nورود به همراه بانک\n1405/07/01 11:32:11")).toBe(false);
    expect(looksLikeTransaction("رمز پویا: 482913\nاعتبار 2 دقیقه")).toBe(false);
    // Blu's purchase OTP: an amount, but money has not moved yet.
    const otp = "بلو\nبفرمایید رمز پویا\nخرید\nازکي\nمبلغ: 4,871,050 ریال\nرمز: 806534\n22:26";
    expect(looksLikeTransaction(otp)).toBe(false);
    expect(parseBankSms(otp + "\n1405.07.01", NOW)).toBeNull();
    // Blu's login notice.
    expect(looksLikeTransaction("بلو\nعبدالرضا عزیز خوش آمدید.\n13:42:35\n1405.07.01")).toBe(false);
  });

  it("is true for an amount the parser could not place", () => {
    expect(looksLikeTransaction("حساب405943623\nمبلغ70,000,000\n07/01")).toBe(true);
    expect(looksLikeTransaction("حساب405943623\nپایا70,000,000-")).toBe(true);
  });
});

describe("normalizeSms", () => {
  it("makes the same message identical however it arrives", () => {
    const a = "بانک رفاه\r\nحساب۴۰۵۹۴۳۶۲۳  \n\nپایا70,000,000-";
    const b = "‏بانک رفاه\nحساب405943623\nپایا70,000,000-";
    expect(normalizeSms(a)).toBe(normalizeSms(b));
  });
});

describe("matchSmsAccount", () => {
  const accounts = [
    { id: "refah", smsMatch: "405943623" },
    { id: "mellat-card", smsMatch: "6104 3377 1234 5678" },
    { id: "cash", smsMatch: null },
  ];

  it("matches a full account number", () => {
    expect(matchSmsAccount({ accountRef: "405943623", bank: null }, accounts)?.id).toBe("refah");
  });

  it("matches a masked card by its trailing digits", () => {
    expect(matchSmsAccount({ accountRef: "****5678", bank: null }, accounts)?.id).toBe("mellat-card");
  });

  it("matches when only the last digits were stored", () => {
    expect(matchSmsAccount({ accountRef: "405943623", bank: null }, [{ id: "x", smsMatch: "3623" }])?.id).toBe("x");
  });

  it("matches a bank that prints no number by the word on its first line", () => {
    const withBlu = [...accounts, { id: "blu", smsMatch: "بلو" }];
    expect(matchSmsAccount({ accountRef: null, bank: "بلو" }, withBlu)?.id).toBe("blu");
    // A number still wins, and a word never matches another bank's message.
    expect(matchSmsAccount({ accountRef: "405943623", bank: "بانک رفاه" }, withBlu)?.id).toBe("refah");
    expect(matchSmsAccount({ accountRef: null, bank: "بانک ملت" }, withBlu)).toBeNull();
  });

  it("refuses short or ambiguous references", () => {
    expect(matchSmsAccount({ accountRef: "***23", bank: null }, accounts)).toBeNull();
    expect(
      matchSmsAccount({ accountRef: "1234", bank: null }, [
        { id: "a", smsMatch: "11111234" },
        { id: "b", smsMatch: "22221234" },
      ]),
    ).toBeNull();
  });
});

describe("normalizeSmsMatch", () => {
  it("keeps digits for a number and a word for a bank name", () => {
    expect(normalizeSmsMatch(" ۴۰۵-۹۴۳-۶۲۳ ")).toEqual({ value: "405943623" });
    expect(normalizeSmsMatch(" بلو ")).toEqual({ value: "بلو" });
    expect(normalizeSmsMatch("بانك رفاه")).toEqual({ value: "بانک رفاه" });
    expect(normalizeSmsMatch("")).toEqual({ value: null });
    expect(normalizeSmsMatch("123")).toEqual({ error: "tooShort" });
    expect(normalizeSmsMatch("ب")).toEqual({ error: "tooShort" });
  });
});

describe("rialTo / splitSmsBatch", () => {
  it("converts rial to toman for toman accounts only", () => {
    expect(rialTo("IRT", 70_000_000)).toEqual({ amount: 7_000_000, currency: "IRT" });
    expect(rialTo("IRR", 70_000_000)).toEqual({ amount: 70_000_000, currency: "IRR" });
  });

  it("splits a queued batch and drops empty entries", () => {
    const body = `${REFAH_PAYA}\n${SMS_BATCH_SEPARATOR}\n\n${SMS_BATCH_SEPARATOR}\nsecond\n${SMS_BATCH_SEPARATOR}\n`;
    expect(splitSmsBatch(body)).toEqual([REFAH_PAYA, "second"]);
  });
});
