import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "./client";

// ---------------------------------------------------------------------------
// Envelope encryption for narrative fields at rest (ARCHITECTURE.md D3).
//
// A per-household data key (DEK) encrypts the rows; the DEK itself is stored
// wrapped by a master key (KEK) from TOKEN_ENCRYPTION_KEY. Rotating the master
// key therefore re-wraps a handful of small rows instead of rewriting every
// transaction, and deleting a household's key makes its narrative fields
// unreadable without touching the rows (crypto-shredding).
//
// Amounts, dates and category ids are deliberately NOT encrypted: SUM, GROUP BY
// and every report depend on them being queryable. See D3 for why that trade is
// the right one.
//
// Ciphertext format:
//
//     fm1:<householdId>:<iv>:<authTag>:<data>          (all base64 but the id)
//
// The household id travels in the header on purpose — it is already a column
// on the row, and carrying it means a value can be decrypted from itself
// without the caller having to know which household it came from. That is what
// makes transparent decryption on arbitrary reads possible at all.
//
// A value that does not start with `fm1:` is returned unchanged. Rows written
// before this existed are therefore still readable, which is what lets the
// backfill run after the deploy rather than in lockstep with it.
// ---------------------------------------------------------------------------

const PREFIX = "fm1";

export function masterKey(envValue = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!envValue) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(envValue, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)",
    );
  }
  return key;
}

/** Raw AES-256-GCM. Used for both the row data and for wrapping a DEK. */
function seal(key: Buffer, plaintext: string): { iv: string; tag: string; data: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function open(key: Buffer, iv: string, tag: string, data: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// A DEK is unwrapped once per process and kept in memory; unwrapping on every
// row would add an AES operation and a query to every field of every read.
const dekCache = new Map<string, Buffer>();

/** Discard cached keys (after rotation, or between tests). */
export function clearKeyCache() {
  dekCache.clear();
}

/** The household's data key, creating one the first time it is needed. */
export async function getDek(householdId: string): Promise<Buffer> {
  const cached = dekCache.get(householdId);
  if (cached) return cached;

  const kek = masterKey();
  const existing = await prisma.householdKey.findUnique({ where: { householdId } });
  if (existing) {
    const [iv, tag, data] = existing.wrappedDek.split(":");
    const dek = Buffer.from(open(kek, iv, tag, data), "base64");
    dekCache.set(householdId, dek);
    return dek;
  }

  const dek = randomBytes(32);
  const wrapped = seal(kek, dek.toString("base64"));
  try {
    await prisma.householdKey.create({
      data: {
        householdId,
        wrappedDek: `${wrapped.iv}:${wrapped.tag}:${wrapped.data}`,
      },
    });
  } catch {
    // Two concurrent writers raced to create the key; whoever lost re-reads
    // the winner's row rather than overwriting it, which would strand every
    // value the winner had already encrypted.
    dekCache.delete(householdId);
    return getDek(householdId);
  }
  dekCache.set(householdId, dek);
  return dek;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function encryptField(householdId: string, plaintext: string): Promise<string> {
  if (isEncrypted(plaintext)) return plaintext; // never double-encrypt
  const { iv, tag, data } = seal(await getDek(householdId), plaintext);
  return [PREFIX, householdId, iv, tag, data].join(":");
}

/**
 * Decrypt a value, or return it unchanged when it is not ciphertext.
 *
 * Returning plaintext untouched is deliberate: it is what allows encryption to
 * be switched on for new writes and the existing rows to be converted
 * afterwards, instead of needing a stop-the-world migration.
 */
export async function decryptField(value: unknown): Promise<unknown> {
  if (!isEncrypted(value)) return value;
  const [, householdId, iv, tag, data] = value.split(":");
  try {
    return open(await getDek(householdId), iv, tag, data);
  } catch {
    // A wrong key must not look like an empty description. Failing loudly is
    // the only honest option: the alternative is silently showing a user blank
    // fields and letting them overwrite real data with nothing.
    throw new Error(
      `Could not decrypt a field for household ${householdId}. ` +
        "TOKEN_ENCRYPTION_KEY is wrong or the data was encrypted with a different key.",
    );
  }
}

/**
 * Read the ORIGINAL ciphertext format: "iv:tag:data", encrypted directly with
 * the master key, with no household in the envelope.
 *
 * Only PlaidItem.accessToken was ever written this way, by the code that
 * predates envelope encryption. The backfill uses this to convert those rows;
 * nothing else should. Returns null when the value is not in that format, so
 * the backfill can tell a legacy token from one already converted.
 */
export function decryptLegacy(value: string): string | null {
  const parts = value.split(":");
  if (parts.length !== 3 || value.startsWith(`${PREFIX}:`)) return null;
  try {
    return open(masterKey(), parts[0], parts[1], parts[2]);
  } catch {
    return null;
  }
}
