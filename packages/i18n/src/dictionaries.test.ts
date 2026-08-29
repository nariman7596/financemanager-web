import { describe, it, expect } from "vitest";
import { en } from "./dictionaries/en";
import { fa } from "./dictionaries/fa";
import { createT } from "./translate";

describe("dictionaries", () => {
  // The rule from CLAUDE.md. A key present in only one dictionary does not
  // throw — it silently falls back to English, so it reaches production
  // looking like a missed translation rather than a bug.
  it("are key-symmetric", () => {
    const enKeys = Object.keys(en).sort();
    const faKeys = Object.keys(fa).sort();
    expect(faKeys.filter((k) => !(k in en))).toEqual([]);
    expect(enKeys.filter((k) => !(k in fa))).toEqual([]);
  });

  it("has no empty translations", () => {
    for (const [k, v] of Object.entries(fa)) expect(v.trim(), `fa: ${k}`).not.toBe("");
    for (const [k, v] of Object.entries(en)) expect(v.trim(), `en: ${k}`).not.toBe("");
  });

  // `{var}` placeholders are positional contracts between the two files: if fa
  // drops one, the Persian string renders with a value missing entirely.
  it("uses the same placeholders in both languages", () => {
    const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(en)) {
      expect(vars(fa[key]), `placeholders differ for "${key}"`).toEqual(vars(en[key]));
    }
  });
});

describe("createT", () => {
  it("looks up the requested locale", () => {
    expect(createT("fa")("app.name")).toBe(fa["app.name"]);
  });

  it("returns the key itself when it exists in neither dictionary", () => {
    expect(createT("fa")("definitely.not.a.key")).toBe("definitely.not.a.key");
  });

  it("interpolates {vars}", () => {
    expect(createT("en")("dashboard.welcomeName", { name: "Nariman" }))
      .toBe("Welcome, Nariman");
  });

  it("leaves an un-supplied placeholder untouched rather than printing undefined", () => {
    expect(createT("en")("dashboard.welcomeName")).toBe("Welcome, {name}");
  });

  it("interpolates the Persian string too", () => {
    const out = createT("fa")("dashboard.welcomeName", { name: "نریمان" });
    expect(out).toContain("نریمان");
    expect(out).not.toContain("{name}");
  });

  it("coerces numeric vars", () => {
    expect(createT("en")("common.inCurrency", { code: 42 })).toBe("in 42");
  });
});
