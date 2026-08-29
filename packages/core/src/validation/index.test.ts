import { describe, it, expect } from "vitest";
import { registerSchema, accountSchema, categorySchema } from "./index";

// These schemas are the single source of truth for input rules and will be
// shared verbatim by the API and the mobile client, so the contract matters
// more than the message text.
describe("registerSchema", () => {
  it("normalises the email (trim + lowercase)", () => {
    const p = registerSchema.parse({
      name: " Nariman ", email: "  NariMan@Example.COM ",
      password: "longenough", baseCurrency: "USD",
    });
    expect(p.email).toBe("nariman@example.com");
    expect(p.name).toBe("Nariman");
  });

  it("rejects a short password", () => {
    expect(registerSchema.safeParse({
      name: "n", email: "a@b.co", password: "short", baseCurrency: "USD",
    }).success).toBe(false);
  });

  it("rejects an unsupported currency", () => {
    expect(registerSchema.safeParse({
      name: "n", email: "a@b.co", password: "longenough", baseCurrency: "XYZ",
    }).success).toBe(false);
  });

  it("accepts the currencies this app was built for", () => {
    for (const baseCurrency of ["IRR", "IRT", "USD", "CAD"]) {
      expect(registerSchema.safeParse({
        name: "n", email: "a@b.co", password: "longenough", baseCurrency,
      }).success, baseCurrency).toBe(true);
    }
  });
});

describe("accountSchema", () => {
  it("coerces a form's string balance to a number", () => {
    // Every value arriving from a <form> is a string.
    expect(accountSchema.parse({
      name: "Cash", type: "CASH", currency: "USD", openingBalance: "125.50",
    }).openingBalance).toBe(125.5);
  });

  it("defaults an omitted balance to zero", () => {
    expect(accountSchema.parse({ name: "Cash", type: "CASH", currency: "USD" })
      .openingBalance).toBe(0);
  });

  it("rejects an unknown account type", () => {
    expect(accountSchema.safeParse({
      name: "Cash", type: "MATTRESS", currency: "USD",
    }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("requires a six-digit hex colour", () => {
    expect(categorySchema.safeParse({ name: "Food", type: "EXPENSE", color: "#abc" })
      .success).toBe(false);
    expect(categorySchema.parse({ name: "Food", type: "EXPENSE", color: "#AABBCC" })
      .color).toBe("#AABBCC");
  });

  it("defaults the colour when omitted", () => {
    expect(categorySchema.parse({ name: "Food", type: "EXPENSE" }).color).toBe("#328eff");
  });
});
