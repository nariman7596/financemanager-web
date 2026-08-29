import { describe, it, expect } from "vitest";
import { ROLES, roleAtLeast } from "./index";

describe("roleAtLeast", () => {
  it("ranks VIEWER < MEMBER < ADMIN < OWNER", () => {
    expect(roleAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(roleAtLeast("ADMIN", "MEMBER")).toBe(true);
    expect(roleAtLeast("MEMBER", "VIEWER")).toBe(true);
    expect(roleAtLeast("VIEWER", "MEMBER")).toBe(false);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
  });

  it("treats a role as meeting its own minimum", () => {
    for (const r of ROLES) expect(roleAtLeast(r, r)).toBe(true);
  });

  // The gate is fed strings from the database and from cookies. An unknown
  // value must fail closed, never pass as "some role".
  it("fails closed for an unknown or forged role", () => {
    for (const bogus of ["", "SUPERUSER", "owner", "admin ", "0", "null"]) {
      expect(roleAtLeast(bogus, "VIEWER"), bogus).toBe(false);
    }
  });
});
