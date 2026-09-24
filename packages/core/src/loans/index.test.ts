import { describe, it, expect } from "vitest";
import { loanStatus } from "./index";
import { accountSchema } from "../validation";

describe("loanStatus", () => {
  it("reads a negative balance as the debt", () => {
    expect(loanStatus(-69_475_878, 2_315_863)).toEqual({ debt: 69_475_878, paymentsLeft: 30 });
  });

  it("rounds a partial last instalment up", () => {
    expect(loanStatus(-250, 100).paymentsLeft).toBe(3);
  });

  it("does not count an extra instalment for floating-point dust", () => {
    expect(loanStatus(-(0.1 + 0.2) * 1000, 100).paymentsLeft).toBe(3);
  });

  it("has no estimate before the first instalment", () => {
    expect(loanStatus(-1_000_000, null)).toEqual({ debt: 1_000_000, paymentsLeft: null });
  });

  it("is settled at zero or above", () => {
    expect(loanStatus(0, 100)).toEqual({ debt: 0, paymentsLeft: null });
    expect(loanStatus(50, 100)).toEqual({ debt: 0, paymentsLeft: null });
  });
});

describe("accountSchema for loans", () => {
  const base = { name: "وام", currency: "IRT" };
  it("stores the typed debt as a negative balance, whatever sign was typed", () => {
    expect(accountSchema.parse({ ...base, type: "LOAN", openingBalance: "500000" }).openingBalance).toBe(-500000);
    expect(accountSchema.parse({ ...base, type: "LOAN", openingBalance: "-500000" }).openingBalance).toBe(-500000);
  });
  it("leaves other account types alone", () => {
    expect(accountSchema.parse({ ...base, type: "CHECKING", openingBalance: "500000" }).openingBalance).toBe(500000);
  });
});
