import { describe, expect, it } from "vitest";
import { pickAlerts, type NotifyInput } from "./index";

const d = (s: string) => new Date(s + "T00:00:00Z");
const base: NotifyInput = {
  bills: [
    { id: "rent", state: "soon", due: d("2026-09-30") },
    { id: "loan", state: "overdue", due: d("2026-09-20") },
    { id: "phone", state: "paid", due: d("2026-09-25") },
    { id: "gym", state: "later", due: d("2026-10-10") },
  ],
  budgets: [
    { id: "food", level: "watch", start: d("2026-09-26") },
    { id: "fun", level: "ok", start: d("2026-09-23") },
  ],
  waitingReview: 3,
  hour: 10,
  day: "2026-09-26",
};

describe("pickAlerts", () => {
  it("sends what is due, worst first, and nothing that is fine", () => {
    expect(pickAlerts(base, new Set()).map((a) => a.key)).toEqual([
      "bill:loan:2026-09-20:overdue",
      "bill:rent:2026-09-30:soon",
      "budget:food:2026-09-26:watch",
    ]);
  });
  it("sends each once — a new state is a new alert", () => {
    const sent = new Set(["bill:loan:2026-09-20:overdue", "bill:rent:2026-09-30:soon", "budget:food:2026-09-26:watch"]);
    expect(pickAlerts(base, sent)).toEqual([]);
    const later = { ...base, bills: [{ id: "rent", state: "today", due: d("2026-09-30") }] };
    expect(pickAlerts(later, sent).map((a) => a.key)).toEqual(["bill:rent:2026-09-30:today"]);
  });
  it("keeps quiet at night", () => {
    expect(pickAlerts({ ...base, hour: 23 }, new Set())).toEqual([]);
    expect(pickAlerts({ ...base, hour: 7 }, new Set())).toEqual([]);
    expect(pickAlerts({ ...base, hour: 8 }, new Set())).toHaveLength(3);
  });
  it("nudges about rows waiting for review once a day, in the evening", () => {
    const evening = { ...base, bills: [], budgets: [], hour: 20 };
    expect(pickAlerts(evening, new Set())).toEqual([{ key: "review:2026-09-26", kind: "review", state: "waiting", ref: "3", url: "/review" }]);
    expect(pickAlerts(evening, new Set(["review:2026-09-26"]))).toEqual([]);
    expect(pickAlerts({ ...evening, waitingReview: 0 }, new Set())).toEqual([]);
  });
});
