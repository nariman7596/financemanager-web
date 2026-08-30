# @financemanager/client-core

The offline engine. Platform-agnostic: no React, no React Native, no Node
built-ins, so the same code runs in a browser, in Hermes and in tests.

The UI reads and writes the **local** store and nothing else. This package
moves data between that store and the server in the background, so no screen
ever waits on the network and offline is a non-event rather than a mode.

```ts
const engine = createEngine({
  store: await createSqlStore(expoSqliteDriver),
  transport: apiClient.sync,
  householdId,
  deviceId,
});

await engine.mutate("transaction", { amount: 12, description: "Coffee" }); // ~ms, offline-safe
const rows = await engine.list("transaction");                             // always local
await engine.sync();                                                       // background
```

## The invariants worth knowing

**A pending local edit outranks anything arriving from the server for the same
row, until it has been pushed.** Overwriting would silently discard something
the user typed offline. Nothing is lost by skipping: pushing bumps the server's
revision, so a later pull delivers the settled value.

**Repeated edits to an unsent row coalesce into one op.** This is correctness,
not thrift. Two ops for one unpushed row carry the *same* baseRevision — the
row's local revision never moved — so the server would apply the first, bump
the revision, then see the second arrive stale and record a conflict against
this device's own earlier edit.

**An auth failure never costs a retry, and never drops the queue.** A token
expiring is not the user's writes being wrong.

**A permanently rejected op is quarantined; the rest of the batch is not
penalised.** Backing off innocent ops behind a bad row is the freezing that
quarantine exists to prevent.

**Push before pull.** The server then has this device's edits before it answers
with its own view, so the pull returns the settled result — including any
conflict the push produced — rather than a version about to be overwritten.

## Storage adapters

| Adapter | Use |
| --- | --- |
| `createMemoryStore()` | tests, and the reference the others are checked against |
| `createSqlStore(driver)` | expo-sqlite on mobile; any driver with `execute`/`select` |

Rows are stored as JSON rather than typed columns: the local mirror is only
read by household and by id, and JSON means a server schema change does not
need a migration on every phone — which matters when an old app version can
stay installed for months.

The SQL adapter's statements are tested against a real engine via
`node:sqlite`, not mocked, so the SQL that will run on a phone is the SQL that
was tested.

**IndexedDB is not here yet.** The web PWA is Phase 12; writing an adapter now
that nothing exercises would be untested storage code, and this is not the
place for that.

## Testing without a device

`createFakeServer()` implements the same rules as the real API (server-assigned
revisions, idempotency by opId, delete-beats-edit, stale-base conflicts), and
`flaky()` wraps any transport to fail every Nth call and to lose responses after
applying them — which is what a real timeout looks like from the client's side.
Both are exported: the mobile app can build screens against them with no
backend running.

## React Query

Deliberately absent. This package stays headless so it can be tested without a
renderer; the React Query bindings live with the app that has React in it
(Phase 8). The engine exposes everything they need: `list`, `get`, `mutate`,
`remove`, `pending`, and an `onChange` callback to invalidate on.
