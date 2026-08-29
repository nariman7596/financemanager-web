# Encryption at rest

What is encrypted, what deliberately is not, and the one way to lose data
permanently.

## The boundary (ARCHITECTURE.md D3)

| Covered | Not covered |
| --- | --- |
| `Transaction.description` | `Transaction.amount` |
| `Transaction.notes` | `Transaction.date` |
| `Transaction.rawSms` | `Transaction.categoryId`, `accountId` |
| `PlaidItem.accessToken` | account and category **names** |

**Why amounts are not encrypted.** Encrypting `amount` would make `SUM()`,
`GROUP BY category`, budget checks and every report impossible in SQL — all of
it would have to happen on-device over the whole decrypted history. That is a
real architectural downgrade for a marginal gain, because an attacker holding
the database also holds category names, timestamps and account structure, from
which spending is trivially inferable. The narrative fields are the ones that
say something the metadata does not.

## How it works

Envelope encryption. Each household has a data key (DEK); the DEK is stored
wrapped by a master key (KEK) from `TOKEN_ENCRYPTION_KEY`.

```
TOKEN_ENCRYPTION_KEY  ──wraps──>  HouseholdKey.wrappedDek  ──encrypts──>  rows
```

Rotating the master key therefore re-wraps one small row per household and
never rewrites a transaction — rotation on a database with a million rows costs
the same as on one with ten.

Ciphertext looks like `fm1:<householdId>:<iv>:<tag>:<data>`. The household id
travels in the header on purpose: a value can then be decrypted from itself,
which is what makes transparent decryption work through arbitrary reads,
including nested `include`s.

Encryption is applied by a Prisma client extension in
`packages/db/src/encryption.extension.ts`, so every consumer gets it without
having to remember. **Anything that constructs its own `PrismaClient` bypasses
it** and writes plain text to disk — the demo seed did exactly that until it
was caught, and a test now fails if a second construction appears anywhere.

A value that is not ciphertext is passed through unchanged. That is what lets
you deploy encryption first and convert existing rows afterwards, instead of
needing a stop-the-world migration.

## Setup

```bash
openssl rand -base64 32     # put the result in .env as TOKEN_ENCRYPTION_KEY
```

Then convert any existing plaintext rows:

```bash
pnpm encrypt:backfill --dry-run   # says what it would do
pnpm encrypt:backfill
```

Safe to run repeatedly, and safe to run while the app is up.

## ⚠️ Losing the key loses the data

`TOKEN_ENCRYPTION_KEY` is not recoverable and not derivable. If it is lost,
every encrypted field is gone permanently — descriptions, notes, bank messages
and Plaid tokens. Amounts, dates and categories survive, so the ledger still
adds up, but the text does not come back.

**The key is not in the database, so a database backup does not contain it.**
Back it up separately:

- keep it in a password manager, **and**
- keep a copy somewhere that is not the same server

Restoring a database dump onto a server with a different `TOKEN_ENCRYPTION_KEY`
produces loud decryption errors rather than blank fields. That is deliberate:
silently showing empty descriptions would let you save over real data with
nothing.

## Rotating the key

```bash
TOKEN_ENCRYPTION_KEY=$(current) \
TOKEN_ENCRYPTION_KEY_NEW=$(openssl rand -base64 32) \
pnpm key:rotate
```

Then put the new value in `.env` and restart. Take a backup first: if rotation
is interrupted, some households are wrapped under the old key and some under
the new one, and only the backup tells you which.

Rehearsed end to end: plaintext seeded, backfilled, read back, rotated, read
back under the new key, and confirmed unreadable under the old one.

## Layers below this

Application-level encryption is the third layer, not the only one:

1. **Transport** — TLS, or the SSH tunnel this deployment uses.
2. **Volume** — full-disk encryption on the VPS, and encrypted backups.
3. **Application** — this document.

Volume encryption protects a stolen disk; this protects a leaked dump, a
misplaced backup, or anyone who can read the database but not the app's
environment.
