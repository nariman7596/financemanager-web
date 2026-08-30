import { describe, expect, it, beforeEach } from "vitest";
import { createEngine, type SyncEngine } from "./engine";
import { createMemoryStore } from "./store/memory";
import { createFakeServer, flaky } from "./testing/fake-server";
import { AuthRequiredError, PermanentPushError, type SyncTransport } from "./types";
import type { LocalStore as Store } from "./store/interface";

const HOUSEHOLD = "h1";

function setup(over: { transport?: SyncTransport; store?: Store; maxAttempts?: number } = {}) {
  const server = createFakeServer(HOUSEHOLD);
  const store = over.store ?? createMemoryStore();
  const engine = createEngine({
    store,
    transport: over.transport ?? server.transport,
    householdId: HOUSEHOLD,
    deviceId: "device-a",
    maxAttempts: over.maxAttempts ?? 5,
    random: () => 0.5, // deterministic backoff
  });
  return { server, store, engine };
}

const offline = (): SyncTransport => ({
  async changes() { throw new Error("network unreachable"); },
  async push() { throw new Error("network unreachable"); },
});

describe("local-first writes", () => {
  it("stores a row and queues it, with no network involved", async () => {
    const { engine, store } = setup({ transport: offline() });
    const row = await engine.mutate("transaction", { amount: 12, description: "Coffee" });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await engine.list("transaction"))[0].description).toBe("Coffee");
    expect(await engine.pending()).toHaveLength(1);
  });

  it("keeps working while offline and pushes everything on reconnect", async () => {
    const { server, store } = setup();
    const engine = createEngine({
      store, transport: offline(), householdId: HOUSEHOLD, deviceId: "d", random: () => 0.5,
    });
    for (const n of [1, 2, 3]) await engine.mutate("transaction", { amount: n });

    const result = await engine.sync();
    expect(result.stoppedBecause).toBe("offline");
    expect(await engine.pending()).toHaveLength(3); // nothing lost

    const online = createEngine({
      store, transport: server.transport, householdId: HOUSEHOLD, deviceId: "d", random: () => 0.5,
    });
    // Backoff was applied, so let the clock move past it.
    for (const e of await online.pending()) await store.updateOutbox(e.opId, { nextAttemptAt: 0 });

    const after = await online.sync();
    expect(after.pushed).toBe(3);
    expect(await online.pending()).toHaveLength(0);
    expect(server.all("transaction")).toHaveLength(3);
  });

  it("gives a create no baseRevision, so two offline creates cannot conflict", async () => {
    const { engine } = setup({ transport: offline() });
    await engine.mutate("transaction", { amount: 1 });
    expect((await engine.pending())[0].baseRevision).toBeNull();
  });

  // Two ops for one unpushed row would carry the SAME baseRevision, and the
  // server would record a conflict against this device's own earlier edit.
  it("coalesces repeated edits to an unsent row into one op", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1, description: "first" });
    await engine.mutate("transaction", { id: row.id, description: "second" });
    await engine.mutate("transaction", { id: row.id, description: "third" });

    const pending = await engine.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.description).toBe("third");

    const result = await engine.sync();
    expect(result.conflicts).toBe(0);
    expect(server.row("transaction", row.id)?.description).toBe("third");
  });

  it("tombstones locally and queues a delete", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1 });
    await engine.sync();

    await engine.remove("transaction", row.id);
    expect(await engine.list("transaction")).toHaveLength(0); // gone from the UI at once
    await engine.sync();
    expect(server.row("transaction", row.id)?.deletedAt).not.toBeNull();
  });
});

describe("the pending-wins invariant", () => {
  // Overwriting here would silently discard something the user typed offline.
  it("does not let an incoming change overwrite an unsent local edit", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1, description: "mine" });
    await engine.sync();

    // Another device changes the same row on the server...
    server.seed("transaction", { id: row.id, description: "theirs", amount: 99 });
    // ...while this device edits it again, offline.
    await engine.mutate("transaction", { id: row.id, description: "mine again" });

    await engine.pull();
    expect((await engine.get("transaction", row.id))?.description).toBe("mine again");
  });

  it("takes the server's value once the local edit has been pushed", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1, description: "mine" });
    await engine.sync();

    server.seed("transaction", { id: row.id, description: "theirs" });
    await engine.pull();
    expect((await engine.get("transaction", row.id))?.description).toBe("theirs");
  });

  it("applies a tombstone from another device", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1 });
    await engine.sync();

    server.transport.push("other-device", [
      { opId: "op-del", entity: "transaction", id: row.id, op: "delete", baseRevision: null },
    ]);
    await engine.pull();
    expect(await engine.list("transaction")).toHaveLength(0);
  });
});

describe("authentication", () => {
  // Losing unsent writes because a token expired would be inexcusable.
  it("preserves the outbox when the session expires mid-sync", async () => {
    const expired: SyncTransport = {
      async changes() { throw new AuthRequiredError(); },
      async push() { throw new AuthRequiredError(); },
    };
    const { engine } = setup({ transport: expired });
    await engine.mutate("transaction", { amount: 1, description: "unsent" });

    const result = await engine.sync();
    expect(result.stoppedBecause).toBe("auth");

    const pending = await engine.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts, "an auth failure must not burn a retry").toBe(0);
    expect((await engine.list("transaction"))[0].description).toBe("unsent");
  });
});

describe("backoff and quarantine", () => {
  it("backs off exponentially rather than hammering the server", async () => {
    const { engine, store } = setup({ transport: offline() });
    await engine.mutate("transaction", { amount: 1 });

    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      for (const e of await store.allOutbox(HOUSEHOLD)) {
        await store.updateOutbox(e.opId, { nextAttemptAt: 0 });
      }
      const before = Date.now();
      await engine.push();
      delays.push((await store.allOutbox(HOUSEHOLD))[0].nextAttemptAt - before);
    }
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  // One bad row must never freeze everything behind it.
  it("quarantines a poisoned op and keeps the rest moving", async () => {
    const server = createFakeServer(HOUSEHOLD);
    const store = createMemoryStore();
    let poisonId = "";
    const transport: SyncTransport = {
      changes: server.transport.changes,
      async push(deviceId, ops) {
        const bad = ops.find((o) => o.id === poisonId);
        if (bad) throw new PermanentPushError("server rejected this row", [bad.opId]);
        return server.transport.push(deviceId, ops);
      },
    };
    const engine = createEngine({
      store, transport, householdId: HOUSEHOLD, deviceId: "d", maxAttempts: 3, random: () => 0.5,
    });

    const poison = await engine.mutate("transaction", { amount: -1 });
    poisonId = poison.id;
    const good = await engine.mutate("transaction", { amount: 5 });

    await engine.push(); // the batch fails; the bad op is quarantined
    expect(await engine.quarantined()).toHaveLength(1);

    await engine.push(); // the rest goes through on the next pass
    expect(server.row("transaction", good.id)).toBeTruthy();
    expect(server.row("transaction", poisonId)).toBeNull();
    expect(await engine.pending()).toHaveLength(0);
  });

  it("quarantines after maxAttempts so the queue drains eventually", async () => {
    const { engine, store } = setup({ transport: offline(), maxAttempts: 2 });
    await engine.mutate("transaction", { amount: 1 });
    for (let i = 0; i < 3; i++) {
      for (const e of await store.allOutbox(HOUSEHOLD)) {
        await store.updateOutbox(e.opId, { nextAttemptAt: 0 });
      }
      await engine.push();
    }
    expect(await engine.quarantined()).toHaveLength(1);
    expect(await engine.pending()).toHaveLength(0);
  });

  it("can retry a quarantined op once the cause is fixed", async () => {
    const { engine, store } = setup({ transport: offline(), maxAttempts: 1 });
    const row = await engine.mutate("transaction", { amount: 1 });
    await engine.push();
    const [bad] = await engine.quarantined();
    expect(bad).toBeTruthy();

    await engine.retry(bad.opId);
    expect(await engine.pending()).toHaveLength(1);
    expect(row.id).toBeTruthy();
  });
});

describe("ordering", () => {
  it("sends an account before the transaction that references it", async () => {
    const server = createFakeServer(HOUSEHOLD);
    const seen: string[] = [];
    const transport: SyncTransport = {
      changes: server.transport.changes,
      async push(deviceId, ops) {
        seen.push(...ops.map((o) => o.entity));
        return server.transport.push(deviceId, ops);
      },
    };
    const { engine } = setup({ transport });

    // Deliberately created in the wrong order.
    const account = await engine.mutate("account", { name: "Cash" });
    await engine.mutate("transaction", { accountId: account.id, amount: 1 });
    await engine.push();

    expect(seen.indexOf("account")).toBeLessThan(seen.indexOf("transaction"));
  });
});

describe("conflicts", () => {
  it("does not retry an op the server settled as a conflict", async () => {
    const { engine, server } = setup();
    const row = await engine.mutate("transaction", { amount: 1, description: "mine" });
    await engine.sync();

    // Another device wins the row.
    server.transport.push("other", [
      { opId: "other-1", entity: "transaction", id: row.id, op: "upsert",
        baseRevision: null, payload: { description: "theirs" } },
    ]);
    // This device edits from the now-stale revision.
    await engine.mutate("transaction", { id: row.id, description: "stale" });
    const result = await engine.sync();

    expect(result.conflicts).toBe(1);
    // Settled, not failed: leaving it queued would retry forever.
    expect(await engine.pending()).toHaveLength(0);
    expect(await engine.quarantined()).toHaveLength(0);
  });
});

describe("convergence under a flaky network", () => {
  // Timeouts, lost responses and duplicate deliveries are the normal case on a
  // phone, not the exception.
  it("converges when every third call fails and responses are lost", async () => {
    const server = createFakeServer(HOUSEHOLD);
    const store = createMemoryStore();
    const engine = createEngine({
      store,
      transport: flaky(server.transport, { failEvery: 3, duplicate: true }),
      householdId: HOUSEHOLD, deviceId: "d", random: () => 0.5,
    });

    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await engine.mutate("transaction", { amount: i, description: `t${i}` })).id);
    }

    // Keep syncing, clearing backoff, as a real app would over time.
    for (let i = 0; i < 30; i++) {
      for (const e of await store.allOutbox(HOUSEHOLD)) {
        await store.updateOutbox(e.opId, { nextAttemptAt: 0 });
      }
      await engine.sync();
      if ((await engine.pending()).length === 0) break;
    }

    expect(await engine.pending()).toHaveLength(0);
    // Idempotency by opId is what stops a lost response becoming a duplicate row.
    expect(server.all("transaction")).toHaveLength(12);
    expect(new Set(server.all("transaction").map((r) => r.id)).size).toBe(12);
    for (const id of ids) expect(server.row("transaction", id)).toBeTruthy();
  });

  it("survives a mid-pull failure without losing its place", async () => {
    const server = createFakeServer(HOUSEHOLD);
    for (let i = 0; i < 5; i++) server.seed("transaction", { id: `r${i}`, amount: i });

    const store = createMemoryStore();
    const engine = createEngine({
      store, transport: flaky(server.transport, { failEvery: 2 }),
      householdId: HOUSEHOLD, deviceId: "d", random: () => 0.5,
    });

    for (let i = 0; i < 10; i++) await engine.pull();
    expect(await engine.list("transaction")).toHaveLength(5);
  });
});

describe("two devices", () => {
  it("converge on the same state through the same server", async () => {
    const server = createFakeServer(HOUSEHOLD);
    const make = (id: string): SyncEngine =>
      createEngine({
        store: createMemoryStore(), transport: server.transport,
        householdId: HOUSEHOLD, deviceId: id, random: () => 0.5,
      });
    const phone = make("phone");
    const laptop = make("laptop");

    await phone.mutate("transaction", { amount: 1, description: "from phone" });
    await laptop.mutate("transaction", { amount: 2, description: "from laptop" });

    await phone.sync();
    await laptop.sync();
    await phone.sync(); // pick up the laptop's row

    const onPhone = (await phone.list("transaction")).map((r) => r.description).sort();
    const onLaptop = (await laptop.list("transaction")).map((r) => r.description).sort();
    expect(onPhone).toEqual(["from laptop", "from phone"]);
    expect(onLaptop).toEqual(onPhone);
  });
});
