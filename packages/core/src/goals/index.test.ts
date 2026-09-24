import { describe, expect, it } from "vitest";
import { goalProgress, monthsBetween, splitSavings } from "./index";

const d = (s: string) => new Date(s + "T00:00:00Z");
const now = d("2026-09-24");

describe("goalProgress", () => {
  it("says what each month has to carry to arrive on time", () => {
    const p = goalProgress({ target: 600, saved: 0, targetDate: d("2027-03-24") }, now);
    expect(p.monthsLeft).toBe(6);
    expect(p.perMonth).toBeCloseTo(100);
    expect(p.status).toBe("onTrack");
    expect(p.share).toBe(0);
  });

  it("is done once the money is there, whatever the date", () => {
    expect(goalProgress({ target: 100, saved: 120, targetDate: d("2026-01-01") }, now)).toMatchObject({ status: "done", remaining: 0, share: 1 });
  });

  it("is overdue past its date with money still missing", () => {
    expect(goalProgress({ target: 100, saved: 40, targetDate: d("2026-09-01") }, now)).toMatchObject({ status: "overdue", perMonth: 60 });
  });

  it("is behind when the money lags the time gone", () => {
    // Half the time gone, a tenth of the money.
    const p = goalProgress({ target: 1000, saved: 100, targetDate: d("2027-03-24") }, now, d("2026-03-24"));
    expect(p.status).toBe("behind");
    // Half the time, half the money: fine.
    expect(goalProgress({ target: 1000, saved: 500, targetDate: d("2027-03-24") }, now, d("2026-03-24")).status).toBe("onTrack");
  });

  it("has no pace without a date", () => {
    expect(goalProgress({ target: 1000, saved: 100, targetDate: null }, now)).toMatchObject({ status: "open", perMonth: null, monthsLeft: null });
  });
});

describe("monthsBetween", () => {
  it("rounds up and never says zero while the date is ahead", () => {
    expect(monthsBetween(now, d("2026-09-30"))).toBe(1);
    expect(monthsBetween(now, d("2026-10-25"))).toBe(2);
  });
});

describe("splitSavings", () => {
  it("gives dated goals what they need and the rest to open ones", () => {
    const r = splitSavings(1000, [
      { id: "car", remaining: 1200, monthsLeft: 6 }, // needs 200
      { id: "trip", remaining: 300, monthsLeft: 3 }, // needs 100
      { id: "invest", remaining: 10_000, monthsLeft: null },
    ]);
    expect(r.amounts).toEqual({ car: 200, trip: 100, invest: 700 });
    expect(r).toMatchObject({ needed: 300, shortfall: 0, spare: 0 });
  });

  it("serves the nearest date first when savings fall short", () => {
    const r = splitSavings(150, [
      { id: "car", remaining: 1200, monthsLeft: 6 },
      { id: "trip", remaining: 300, monthsLeft: 3 },
    ]);
    expect(r.amounts).toEqual({ car: 50, trip: 100 });
    expect(r.shortfall).toBe(150);
  });

  it("does not give an open goal more than it lacks, and says what is spare", () => {
    const r = splitSavings(1000, [
      { id: "a", remaining: 100, monthsLeft: null },
      { id: "b", remaining: 5000, monthsLeft: null },
    ]);
    expect(r.amounts.a).toBeCloseTo(100);
    expect(r.amounts.b).toBeCloseTo(900);
    expect(r.spare).toBeCloseTo(0);
    const done = splitSavings(500, [{ id: "a", remaining: 100, monthsLeft: null }]);
    expect(done.spare).toBeCloseTo(400);
  });

  it("gives finished goals nothing", () => {
    expect(splitSavings(100, [{ id: "x", remaining: 0, monthsLeft: 2 }]).amounts).toEqual({ x: 0 });
  });
});
