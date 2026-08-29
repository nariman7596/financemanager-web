import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORIES,
  rootCategories,
  childCategories,
  categoryName,
} from "./index";
import { LOCALES } from "@financemanager/i18n/config";

describe("the default category tree", () => {
  it("has unique seed keys", () => {
    const keys = DEFAULT_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size, "duplicate key").toBe(keys.length);
  });

  // Seeding resolves a child's parent by key and skips the child when it does
  // not resolve. A typo would therefore lose a category silently.
  it("points every child at a parent that exists", () => {
    const keys = new Set(DEFAULT_CATEGORIES.map((c) => c.key));
    for (const c of childCategories()) {
      expect(keys.has(c.parent!), `${c.key} -> missing parent "${c.parent}"`).toBe(true);
    }
  });

  it("nests exactly one level deep", () => {
    const parentKeys = new Set(childCategories().map((c) => c.parent));
    for (const c of childCategories()) {
      expect(parentKeys.has(c.key), `${c.key} is both a parent and a child`).toBe(false);
    }
  });

  it("gives a child the same type as its parent", () => {
    const byKey = new Map(DEFAULT_CATEGORIES.map((c) => [c.key, c]));
    for (const c of childCategories()) {
      expect(c.type, `${c.key}`).toBe(byKey.get(c.parent!)!.type);
    }
  });

  // The database enforces this with a partial unique index; catching it here
  // means a bad default fails a test run instead of a user's first sign-up.
  it("has no two roots with the same name and type, in any locale", () => {
    for (const locale of LOCALES) {
      const seen = new Set<string>();
      for (const c of rootCategories()) {
        const k = `${categoryName(c, locale)}|${c.type}`;
        expect(seen.has(k), `duplicate root "${k}" in ${locale}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("has no two siblings with the same name, in any locale", () => {
    for (const locale of LOCALES) {
      const seen = new Set<string>();
      for (const c of childCategories()) {
        const k = `${c.parent}|${categoryName(c, locale)}|${c.type}`;
        expect(seen.has(k), `duplicate sibling "${k}" in ${locale}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("names every category in every supported locale", () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const locale of LOCALES) {
        expect(c.names[locale]?.trim(), `${c.key} missing ${locale}`).toBeTruthy();
      }
    }
  });

  it("covers all three category types", () => {
    const types = new Set(DEFAULT_CATEGORIES.map((c) => c.type));
    expect([...types].sort()).toEqual(["EXPENSE", "INCOME", "INVESTMENT"]);
  });
});
