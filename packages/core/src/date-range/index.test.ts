import { describe, it, expect } from "vitest";
import { resolveRange, computePreset, DEFAULT_PRESET, RANGE_PRESETS } from "./index";

const NOW = new Date("2026-08-12T00:00:00.000Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("resolveRange", () => {
  it("honours an explicit valid custom range", () => {
    const r = resolveRange({ from: "2026-01-01", to: "2026-03-31" }, NOW);
    expect(r.preset).toBe("custom");
    expect(r.fromStr).toBe("2026-01-01");
    expect(r.toStr).toBe("2026-03-31");
  });

  it("covers the whole final day of a custom range", () => {
    // An end of midnight would silently drop everything entered on the last day.
    const r = resolveRange({ from: "2026-01-01", to: "2026-01-01" }, NOW);
    expect(r.end.getTime()).toBeGreaterThan(r.start.getTime());
    expect(ymd(r.end)).toBe("2026-01-01");
  });

  it("falls back to the default preset when no params are given", () => {
    expect(resolveRange({}, NOW).preset).toBe(DEFAULT_PRESET);
  });

  // Known limitation, documented in CLAUDE.md: a reversed range falls back to
  // the preset silently, because the Jalali selects cannot express the native
  // date input's min/max. Pinned so the behaviour is deliberate, not accidental.
  it("falls back to the preset for a reversed range instead of erroring", () => {
    const r = resolveRange({ from: "2026-03-31", to: "2026-01-01" }, NOW);
    expect(r.preset).toBe(DEFAULT_PRESET);
  });

  it("falls back to the preset for an unparseable date", () => {
    expect(resolveRange({ from: "nonsense", to: "2026-01-01" }, NOW).preset)
      .toBe(DEFAULT_PRESET);
  });

  it("prefers a named preset over from/to", () => {
    const r = resolveRange({ preset: "this-month", from: "2020-01-01", to: "2020-02-01" }, NOW);
    expect(r.preset).toBe("this-month");
  });

  it("gives every preset a label key the dictionaries can translate", () => {
    for (const p of RANGE_PRESETS) {
      expect(resolveRange({ preset: p.key }, NOW).labelKey).toBe(p.labelKey);
    }
  });
});

describe("computePreset", () => {
  it("resolves this-month in the Gregorian calendar for en", () => {
    const { start, end } = computePreset("this-month", NOW, "en");
    expect(ymd(start)).toBe("2026-08-01");
    expect(ymd(end)).toBe("2026-08-31");
  });

  // The same preset must mean the month the user actually lives in.
  it("resolves this-month in the Jalali calendar for fa", () => {
    const { start, end } = computePreset("this-month", NOW, "fa");
    expect(ymd(start)).toBe("2026-07-23");
    expect(ymd(end)).toBe("2026-08-22");
  });

  it("returns ranges in chronological order for every preset", () => {
    for (const p of RANGE_PRESETS) {
      for (const locale of ["en", "fa"] as const) {
        const { start, end } = computePreset(p.key, NOW, locale);
        expect(start.getTime(), `${p.key}/${locale}`).toBeLessThan(end.getTime());
      }
    }
  });
});
