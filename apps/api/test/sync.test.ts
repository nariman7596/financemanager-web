import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@financemanager/db";
import { api, createUser, resetDatabase, startServer, stopServer, type Session } from "./helpers";

let owner: Session;
let household: string;
let accountId: string;

const uuid = () => randomUUID();

async function push(token: string, deviceId: string, ops: unknown[]) {
  return api("/sync/push", { token, household, body: { deviceId, ops } });
}
async function pull(token: string, since = "0", deviceId?: string) {
  const res = await fetch(
    `http://127.0.0.1:${process.env.API_TEST_PORT ?? 3399}/api/v1/sync/changes?since=${since}`,
    { headers: { Authorization: `Bearer ${token}`, "X-Household-Id": household,
                 ...(deviceId ? { "X-Device-Id": deviceId } : {}) } },
  );
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(async () => {
  await resetDatabase();
  await startServer();
}, 120_000);
afterAll(stopServer);

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("sync@example.com");
  household = owner.households[0].id;
  const acc = await api("/accounts", {
    token: owner.accessToken, household,
    body: { name: "Cash", type: "CASH", currency: "USD", openingBalance: 0 },
  });
  accountId = acc.body.id;
});

const txnPayload = (over: Record<string, unknown> = {}) => ({
  accountId, type: "EXPENSE", amount: 10, currency: "USD",
  date: new Date("2026-08-12").toISOString(), description: "Coffee", ...over,
});

describe("pull", () => {
  it("returns everything from a cold cursor, tombstones included", async () => {
    const res = await pull(owner.accessToken, "0");
    expect(res.status).toBe(200);
    // The seeded category tree plus the account.
    expect(res.body.changes.length).toBeGreaterThan(30);
    expect(new Set(res.body.changes.map((c: any) => c.entity)))
      .toContain("category");
  });

  it("returns nothing when the cursor is already current", async () => {
    const first = await pull(owner.accessToken, "0");
    const second = await pull(owner.accessToken, first.body.nextCursor);
    expect(second.body.changes).toHaveLength(0);
    expect(second.body.hasMore).toBe(false);
  });

  // Rows seeded with a household all share one revision, so a cursor that
  // carried only the revision would let a page boundary fall inside that group
  // and skip the rest of it.
  it("pages through ties without skipping rows", async () => {
    const seen = new Set<string>();
    let cursor = "0";
    for (let i = 0; i < 50; i++) {
      const res = await fetch(
        `http://127.0.0.1:${process.env.API_TEST_PORT ?? 3399}/api/v1/sync/changes?since=${cursor}&limit=3`,
        { headers: { Authorization: `Bearer ${owner.accessToken}`, "X-Household-Id": household } },
      );
      const body = (await res.json()) as any;
      for (const c of body.changes) seen.add(`${c.entity}:${c.id}`);
      cursor = body.nextCursor;
      if (!body.hasMore) break;
    }
    const total = await prisma.category.count({ where: { householdId: household } });
    // Every seeded category must have come through, none twice.
    const categories = [...seen].filter((k) => k.startsWith("category:"));
    expect(categories.length).toBe(total);
  });

  it("propagates a delete as a tombstone", async () => {
    const created = await api("/transactions", {
      token: owner.accessToken, household, body: txnPayload(),
    });
    const before = await pull(owner.accessToken, "0");
    await api(`/transactions/${created.body.id}`, {
      token: owner.accessToken, household, method: "DELETE",
    });
    const after = await pull(owner.accessToken, before.body.nextCursor);
    const tombstone = after.body.changes.find((c: any) => c.id === created.body.id);
    expect(tombstone, "the delete never reached the other device").toBeTruthy();
    expect(tombstone.deletedAt).not.toBeNull();
  });
});

describe("push", () => {
  it("creates a row the client already has an id for", async () => {
    const id = uuid();
    const res = await push(owner.accessToken, "dev-1", [
      { opId: uuid(), entity: "transaction", id, op: "upsert", payload: txnPayload() },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.applied).toHaveLength(1);
    expect(res.body.conflicts).toHaveLength(0);

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(row.description).toBe("Coffee");
    expect(row.householdId).toBe(household);
  });

  // The property that makes retry-after-timeout safe.
  it("applies a replayed batch exactly once", async () => {
    const id = uuid();
    const ops = [{ opId: uuid(), entity: "transaction", id, op: "upsert",
                   payload: txnPayload({ description: "Once" }) }];

    const first = await push(owner.accessToken, "dev-1", ops);
    const revision = first.body.applied[0].revision;

    const replay = await push(owner.accessToken, "dev-1", ops);
    expect(replay.body.applied[0].revision, "the replay allocated a new revision")
      .toBe(revision);

    const count = await prisma.transaction.count({ where: { householdId: household } });
    expect(count).toBe(1);
  });

  it("ignores a householdId smuggled into the payload", async () => {
    const other = await createUser("other@example.com");
    const id = uuid();
    await push(owner.accessToken, "dev-1", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        payload: txnPayload({ householdId: other.households[0].id }) },
    ]);
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(row.householdId).toBe(household);
  });

  it("applies a batch in FK order regardless of how it was listed", async () => {
    const catId = uuid();
    const txnId = uuid();
    // Transaction first — it references a category that is later in the batch.
    const res = await push(owner.accessToken, "dev-1", [
      { opId: uuid(), entity: "transaction", id: txnId, op: "upsert",
        payload: txnPayload({ categoryId: catId }) },
      { opId: uuid(), entity: "category", id: catId, op: "upsert",
        payload: { name: "Offline category", type: "EXPENSE", color: "#123456" } },
    ]);
    expect(res.status).toBe(201);
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: txnId } });
    expect(row.categoryId).toBe(catId);
  });

  it("rolls the whole batch back if one op fails", async () => {
    const good = uuid();
    const res = await push(owner.accessToken, "dev-1", [
      { opId: uuid(), entity: "transaction", id: good, op: "upsert", payload: txnPayload() },
      { opId: uuid(), entity: "transaction", id: uuid(), op: "upsert",
        payload: txnPayload({ accountId: "does-not-exist" }) },
    ]);
    expect(res.status).toBeGreaterThanOrEqual(400);
    // A half-applied batch would leave a transaction pointing at nothing.
    expect(await prisma.transaction.findUnique({ where: { id: good } })).toBeNull();
  });
});

describe("conflicts", () => {
  // The exit criterion: two devices offline, both edit, both reconnect.
  it("converges two devices and keeps the losing value", async () => {
    const id = uuid();
    await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        payload: txnPayload({ description: "Original" }) },
    ]);
    const base = (await prisma.transaction.findUniqueOrThrow({ where: { id } })).revision;

    // Both devices edited from the same base revision while offline.
    const phone = await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        baseRevision: String(base), payload: txnPayload({ description: "Phone edit" }) },
    ]);
    expect(phone.body.conflicts).toHaveLength(0);

    const laptop = await push(owner.accessToken, "laptop", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        baseRevision: String(base), payload: txnPayload({ description: "Laptop edit" }) },
    ]);
    expect(laptop.body.conflicts).toHaveLength(1);

    // One row, not two — and the later arrival holds it.
    expect(await prisma.transaction.count({ where: { householdId: household } })).toBe(1);
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(row.description).toBe("Laptop edit");

    // The overwritten value is kept for review, never silently dropped.
    const conflicts = await api("/sync/conflicts", { token: owner.accessToken, household });
    expect(conflicts.body).toHaveLength(1);
    expect((conflicts.body[0].losingPayload as any).description).toBe("Phone edit");

    // Both devices now pull the same state.
    const a = await pull(owner.accessToken, "0");
    const b = await pull(owner.accessToken, "0");
    expect(a.body.changes).toEqual(b.body.changes);
  });

  it("lets a delete beat a concurrent edit", async () => {
    const id = uuid();
    await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "upsert", payload: txnPayload() },
    ]);
    const base = (await prisma.transaction.findUniqueOrThrow({ where: { id } })).revision;

    await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "delete", baseRevision: String(base) },
    ]);
    const edit = await push(owner.accessToken, "laptop", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        baseRevision: String(base), payload: txnPayload({ description: "Resurrected" }) },
    ]);

    expect(edit.body.conflicts).toHaveLength(1);
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    // Bringing back a row somebody deliberately deleted is worse than losing
    // an edit to it.
    expect(row.deletedAt).not.toBeNull();
    expect(row.description).not.toBe("Resurrected");
  });

  it("does not conflict two offline creates", async () => {
    const res = await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id: uuid(), op: "upsert",
        payload: txnPayload({ description: "One" }) },
      { opId: uuid(), entity: "transaction", id: uuid(), op: "upsert",
        payload: txnPayload({ description: "Two" }) },
    ]);
    // Client-generated ids mean two offline creates really are two rows.
    expect(res.body.conflicts).toHaveLength(0);
    expect(await prisma.transaction.count({ where: { householdId: household } })).toBe(2);
  });

  it("resolves a conflict", async () => {
    const id = uuid();
    await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "upsert", payload: txnPayload() },
    ]);
    const base = (await prisma.transaction.findUniqueOrThrow({ where: { id } })).revision;
    await push(owner.accessToken, "phone", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        baseRevision: String(base), payload: txnPayload({ description: "a" }) }]);
    await push(owner.accessToken, "laptop", [
      { opId: uuid(), entity: "transaction", id, op: "upsert",
        baseRevision: String(base), payload: txnPayload({ description: "b" }) }]);

    const open = await api("/sync/conflicts", { token: owner.accessToken, household });
    const res = await api(`/sync/conflicts/${open.body[0].id}/resolve`, {
      token: owner.accessToken, household, method: "POST",
    });
    expect(res.status).toBe(201);
    const after = await api("/sync/conflicts", { token: owner.accessToken, household });
    expect(after.body).toHaveLength(0);
  });
});

describe("isolation", () => {
  it("never returns another household's changes", async () => {
    const stranger = await createUser("stranger@example.com");
    const res = await fetch(
      `http://127.0.0.1:${process.env.API_TEST_PORT ?? 3399}/api/v1/sync/changes?since=0`,
      { headers: { Authorization: `Bearer ${stranger.accessToken}`,
                   "X-Household-Id": household } },
    );
    const body = (await res.json()) as any;
    const ids = body.changes.map((c: any) => c.householdId);
    expect(new Set(ids)).not.toContain(household);
  });

  it("refuses a push from a VIEWER", async () => {
    const viewer = await createUser("viewer@example.com");
    await prisma.membership.create({
      data: { householdId: household, userId: viewer.user.id, role: "VIEWER" },
    });
    const res = await push(viewer.accessToken, "dev-v", [
      { opId: uuid(), entity: "transaction", id: uuid(), op: "upsert", payload: txnPayload() },
    ]);
    expect(res.status).toBe(403);
  });
});
