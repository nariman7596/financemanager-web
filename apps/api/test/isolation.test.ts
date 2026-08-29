import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@financemanager/db";
import { api, register, resetDatabase, startServer, stopServer, type Session } from "./helpers";

// ---------------------------------------------------------------------------
// The permanent isolation suite (ROADMAP standing rule 3).
//
// A member of household A must never, by any route, read or write a row
// belonging to household B — including by forging the household header or
// putting a householdId in the body.
// ---------------------------------------------------------------------------

let alice: Session;
let bob: Session;
let aliceAccountId: string;
let aliceHousehold: string;
let bobHousehold: string;

beforeAll(async () => {
  await resetDatabase();
  await startServer();
  alice = await register("alice@example.com");
  bob = await register("bob@example.com");
  aliceHousehold = alice.households[0].id;
  bobHousehold = bob.households[0].id;

  const created = await api("/accounts", {
    token: alice.accessToken,
    body: { name: "Alice Chequing", type: "CHECKING", currency: "CAD", openingBalance: 100 },
  });
  expect(created.status).toBe(201);
  aliceAccountId = created.body.id;
}, 120_000);

afterAll(stopServer);

describe("household isolation", () => {
  it("gives each registration its own household", () => {
    expect(aliceHousehold).not.toBe(bobHousehold);
  });

  it("does not leak rows into another household's list", async () => {
    const res = await api("/accounts", { token: bob.accessToken });
    expect(res.status).toBe(200);
    expect(res.body.map((a: any) => a.id)).not.toContain(aliceAccountId);
  });

  // 404 rather than 403: a 403 would confirm the row exists, which is itself
  // a disclosure. Another household's id must be indistinguishable from a
  // made-up one.
  it("answers 404 — not 403 — for another household's row", async () => {
    const res = await api(`/accounts/${aliceAccountId}`, { token: bob.accessToken });
    expect(res.status).toBe(404);

    const madeUp = await api("/accounts/does-not-exist", { token: bob.accessToken });
    expect(madeUp.status).toBe(res.status);
  });

  it("refuses to update another household's row", async () => {
    const res = await api(`/accounts/${aliceAccountId}`, {
      token: bob.accessToken, method: "PATCH", body: { name: "Stolen" },
    });
    expect(res.status).toBe(404);

    const still = await prisma.account.findUniqueOrThrow({ where: { id: aliceAccountId } });
    expect(still.name).toBe("Alice Chequing");
  });

  it("refuses to delete another household's row", async () => {
    const res = await api(`/accounts/${aliceAccountId}`, {
      token: bob.accessToken, method: "DELETE",
    });
    expect(res.status).toBe(404);

    const still = await prisma.account.findUniqueOrThrow({ where: { id: aliceAccountId } });
    expect(still.deletedAt).toBeNull();
  });

  // The header is a preference, not an authorisation. Forging it must degrade
  // to the caller's own household rather than granting anything.
  it("ignores a forged X-Household-Id header", async () => {
    const res = await api("/accounts", { token: bob.accessToken, household: aliceHousehold });
    expect(res.status).toBe(200);
    expect(res.body.map((a: any) => a.id)).not.toContain(aliceAccountId);

    const one = await api(`/accounts/${aliceAccountId}`, {
      token: bob.accessToken, household: aliceHousehold,
    });
    expect(one.status).toBe(404);
  });

  it("ignores a householdId smuggled in the body", async () => {
    const res = await api("/accounts", {
      token: bob.accessToken,
      body: {
        name: "Planted", type: "CASH", currency: "USD", openingBalance: 0,
        householdId: aliceHousehold, createdById: alice.user.id,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.householdId).toBe(bobHousehold);

    const inAlices = await prisma.account.findMany({ where: { householdId: aliceHousehold } });
    expect(inAlices.map((a) => a.name)).not.toContain("Planted");
  });

  it("scopes every resource, not just accounts", async () => {
    for (const resource of ["categories", "transactions", "budgets", "investments"]) {
      const mine = await api(`/${resource}`, { token: bob.accessToken });
      expect(mine.status, resource).toBe(200);
      for (const row of mine.body) {
        expect(row.householdId, `${resource} leaked a row`).toBe(bobHousehold);
      }
    }
  });
});

describe("authentication", () => {
  it("rejects a request with no token", async () => {
    expect((await api("/accounts")).status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    expect((await api("/accounts", { token: "not-a-jwt" })).status).toBe(401);
  });

  // The web app signs its session cookie with the same secret. Without the
  // scope claim it must not work as an API bearer token, or a stolen cookie
  // would become full API access.
  it("rejects a web session token (no api scope)", async () => {
    const { SignJWT } = await import("jose");
    const webToken = await new SignJWT({ userId: alice.user.id, email: alice.user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect((await api("/accounts", { token: webToken })).status).toBe(401);
  });
});

describe("roles", () => {
  it("lets a VIEWER read but not write", async () => {
    // Put Bob in Alice's household as a VIEWER, then have him select it.
    await prisma.membership.create({
      data: { householdId: aliceHousehold, userId: bob.user.id, role: "VIEWER" },
    });

    const read = await api("/accounts", { token: bob.accessToken, household: aliceHousehold });
    expect(read.status).toBe(200);
    expect(read.body.map((a: any) => a.id)).toContain(aliceAccountId);

    const write = await api("/accounts", {
      token: bob.accessToken, household: aliceHousehold,
      body: { name: "Nope", type: "CASH", currency: "USD", openingBalance: 0 },
    });
    expect(write.status).toBe(403);

    const del = await api(`/accounts/${aliceAccountId}`, {
      token: bob.accessToken, household: aliceHousehold, method: "DELETE",
    });
    expect(del.status).toBe(403);
  });

  it("lets a MEMBER write", async () => {
    await prisma.membership.updateMany({
      where: { householdId: aliceHousehold, userId: bob.user.id },
      data: { role: "MEMBER" },
    });
    const write = await api("/accounts", {
      token: bob.accessToken, household: aliceHousehold,
      body: { name: "Bob's addition", type: "CASH", currency: "USD", openingBalance: 0 },
    });
    expect(write.status).toBe(201);
    expect(write.body.householdId).toBe(aliceHousehold);
  });
});

describe("serialisation", () => {
  it("returns revision as a string, not a JSON number", async () => {
    const res = await api("/accounts", { token: alice.accessToken });
    expect(res.status).toBe(200);
    // A BigInt throws in JSON.stringify outright, and a JSON number would lose
    // precision above 2^53 — which would silently corrupt a sync cursor.
    expect(typeof res.body[0].revision).toBe("string");
  });

  it("gives every write a revision above zero", async () => {
    const res = await api("/categories", { token: alice.accessToken });
    for (const row of res.body) {
      expect(BigInt(row.revision), `${row.name} would never sync`).toBeGreaterThan(0n);
    }
  });
});
