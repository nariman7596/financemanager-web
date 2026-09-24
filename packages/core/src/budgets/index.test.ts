import { describe, it, expect } from "vitest";
import { budgetStatus, budgetWindow } from "./index";
import { toJalaliParts } from "../calendar";

const d = (iso: string) => new Date(iso);
const ymd = (x: Date) => x.toISOString().slice(0, 10);

describe("budgetWindow", () => {
  const now = d("2026-09-30T12:00:00Z"); // Wednesday 8 Mehr 1405

  it("a Persian week runs Saturday to Friday", () => {
    const w = budgetWindow("WEEKLY", now, "fa");
    expect(w.start.getUTCDay()).toBe(6); // Saturday
    expect(ymd(w.start)).toBe("2026-09-26");
    expect(ymd(w.end)).toBe("2026-10-02"); // Friday
  });

  it("a Persian month is the Jalali month", () => {
    const w = budgetWindow("MONTHLY", now, "fa");
    expect(ymd(w.start)).toBe("2026-09-23"); // 1 Mehr
    expect(ymd(w.end)).toBe("2026-10-22"); // 30 Mehr
  });

  it("a Persian year starts at Nowruz", () => {
    const w = budgetWindow("YEARLY", now, "fa");
    expect(toJalaliParts(ymd(w.start))).toEqual({ year: 1405, month: 1, day: 1 });
    expect(toJalaliParts(ymd(w.end))).toMatchObject({ year: 1405, month: 12 });
  });

  it("an English month is the Gregorian month", () => {
    const w = budgetWindow("MONTHLY", now, "en");
    expect(ymd(w.start)).toBe("2026-09-01");
    expect(ymd(w.end)).toBe("2026-09-30");
  });
});

describe("budgetStatus", () => {
  const start = d("2026-09-23T00:00:00Z");
  const end = d("2026-10-22T23:59:59.999Z"); // 30 days
  const at = (day: number) => new Date(start.getTime() + day * 86_400_000);

  it("is fine well under the limit and on pace", () => {
    const s = budgetStatus({ limit: 3_000_000, spent: 1_000_000, start, end, now: at(15) });
    expect(s.level).toBe("ok");
    expect(s.remaining).toBe(2_000_000);
    expect(s.daysLeft).toBe(15);
    expect(s.perDayLeft).toBe(133_333);
  });

  it("warns at 80% used", () => {
    expect(budgetStatus({ limit: 1000, spent: 800, start, end, now: at(28) }).level).toBe("watch");
  });

  it("warns when the pace would run past the limit", () => {
    // Half the budget gone in a quarter of the month.
    const s = budgetStatus({ limit: 1000, spent: 500, start, end, now: at(7.5) });
    expect(s.level).toBe("watch");
    expect(s.projected).toBeGreaterThan(1000);
  });

  it("does not cry wolf on pace in the first days", () => {
    const s = budgetStatus({ limit: 1000, spent: 300, start, end, now: at(2) });
    expect(s.level).toBe("ok");
    expect(s.paceWarning).toBe(false); // 300 in 2 days "projects" to 4,500 — meaningless yet
  });

  it("is over past the limit, with nothing left per day", () => {
    const s = budgetStatus({ limit: 1000, spent: 1200, start, end, now: at(20) });
    expect(s).toMatchObject({ level: "over", pct: 120, remaining: 0, perDayLeft: null });
  });

  it("treats a zero limit as nothing to warn about", () => {
    expect(budgetStatus({ limit: 0, spent: 50, start, end, now: at(10) }).level).toBe("ok");
  });
});
