import { describe, expect, it } from "vitest";
import {
  jalaliToUtcDate,
  matchSmsAccount,
  normalizeSms,
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
      date: new Date("2026-09-23T00:00:00Z"), // 1 Mehr 1405
      time: "11:32",
    });
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
    expect(matchSmsAccount("405943623", accounts)?.id).toBe("refah");
  });

  it("matches a masked card by its trailing digits", () => {
    expect(matchSmsAccount("****5678", accounts)?.id).toBe("mellat-card");
  });

  it("matches when only the last digits were stored", () => {
    expect(matchSmsAccount("405943623", [{ id: "x", smsMatch: "3623" }])?.id).toBe("x");
  });

  it("refuses short or ambiguous references", () => {
    expect(matchSmsAccount("***23", accounts)).toBeNull();
    expect(
      matchSmsAccount("1234", [
        { id: "a", smsMatch: "11111234" },
        { id: "b", smsMatch: "22221234" },
      ]),
    ).toBeNull();
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
