import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@financemanager/db";
import { api, register, resetDatabase, startServer, stopServer } from "./helpers";

beforeAll(async () => {
  await resetDatabase();
  await startServer();
}, 120_000);
afterAll(stopServer);

describe("refresh token rotation", () => {
  it("issues a new pair and invalidates the old token", async () => {
    const s = await register("rotate@example.com");
    const first = await api("/auth/refresh", { body: { refreshToken: s.refreshToken } });
    expect(first.status).toBe(201);
    expect(first.body.refreshToken).not.toBe(s.refreshToken);
    expect(first.body.accessToken).toBeTruthy();

    // The new one works...
    const second = await api("/auth/refresh", { body: { refreshToken: first.body.refreshToken } });
    expect(second.status).toBe(201);
  });

  // The point of rotation: a stolen token replayed after the real client has
  // already rotated is unmistakable, and the only safe response is to kill
  // every session descended from it.
  it("revokes the entire family when a rotated token is reused", async () => {
    const s = await register("reuse@example.com");
    const stolen = s.refreshToken;

    const rotated = await api("/auth/refresh", { body: { refreshToken: stolen } });
    expect(rotated.status).toBe(201);
    const live = rotated.body.refreshToken;

    // The thief replays the old token.
    const replay = await api("/auth/refresh", { body: { refreshToken: stolen } });
    expect(replay.status).toBe(401);

    // ...which must also kill the legitimate client's current token.
    const afterBreach = await api("/auth/refresh", { body: { refreshToken: live } });
    expect(afterBreach.status).toBe(401);

    const rows = await prisma.refreshToken.findMany({ where: { userId: s.user.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.revokedAt !== null), "a live token survived the breach").toBe(true);
  });

  it("rejects an unknown refresh token", async () => {
    expect((await api("/auth/refresh", { body: { refreshToken: "made-up" } })).status).toBe(401);
  });

  it("logs out by revoking just that session", async () => {
    const s = await register("logout@example.com");
    expect((await api("/auth/logout", { body: { refreshToken: s.refreshToken } })).status).toBe(201);
    expect((await api("/auth/refresh", { body: { refreshToken: s.refreshToken } })).status).toBe(401);
  });

  it("never stores a refresh token in the clear", async () => {
    const s = await register("hashed@example.com");
    const rows = await prisma.refreshToken.findMany({ where: { userId: s.user.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].tokenHash).not.toBe(s.refreshToken);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("credentials", () => {
  it("rejects a wrong password", async () => {
    await register("pw@example.com");
    const res = await api("/auth/login", {
      body: { email: "pw@example.com", password: "wrong-password" },
    });
    expect(res.status).toBe(401);
  });

  it("does not reveal whether an email exists", async () => {
    const missing = await api("/auth/login", {
      body: { email: "nobody@example.com", password: "password123" },
    });
    const wrong = await api("/auth/login", {
      body: { email: "pw@example.com", password: "wrong-password" },
    });
    expect(missing.status).toBe(wrong.status);
    expect(missing.body.message).toBe(wrong.body.message);
  });

  it("refuses to register the same email twice", async () => {
    await register("dupe@example.com");
    const again = await api("/auth/register", {
      body: { name: "Dupe", email: "dupe@example.com", password: "password123", baseCurrency: "USD" },
    });
    expect(again.status).toBe(409);
  });

  it("validates input with the shared zod schemas", async () => {
    const res = await api("/auth/register", {
      body: { name: "X", email: "not-an-email", password: "short", baseCurrency: "ZZZ" },
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path).sort()).toEqual(
      ["baseCurrency", "email", "password"],
    );
  });
});
