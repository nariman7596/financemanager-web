/**
 * Rotate the master key (KEK).
 *
 * Only the wrapped data keys change — one small row per household. The
 * transactions themselves are never rewritten, which is the entire point of
 * envelope encryption: rotating a key on a database with a million rows costs
 * the same as on one with ten.
 *
 *   TOKEN_ENCRYPTION_KEY=<current> \
 *   TOKEN_ENCRYPTION_KEY_NEW=$(openssl rand -base64 32) \
 *   pnpm --filter @financemanager/db key:rotate
 *
 * Then put the NEW value in .env as TOKEN_ENCRYPTION_KEY and restart. Take a
 * backup first: if this is interrupted, some households are wrapped under the
 * old key and some under the new one, and only the backup tells you which.
 */
import { rawPrisma } from "../src/client";
import { masterKey } from "../src/crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function unwrap(key: Buffer, wrapped: string): Buffer {
  const [iv, tag, data] = wrapped.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return Buffer.from(out.toString("utf8"), "base64");
}

function wrap(key: Buffer, dek: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(dek.toString("base64"), "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(":");
}

async function main() {
  const oldKey = masterKey();
  const newKey = masterKey(process.env.TOKEN_ENCRYPTION_KEY_NEW);
  if (oldKey.equals(newKey)) throw new Error("The new key is the same as the current one");

  const keys = await rawPrisma.householdKey.findMany();
  let rotated = 0;
  for (const row of keys) {
    // Unwrap with the old key, re-wrap with the new one. The DEK itself — and
    // therefore every value it has ever encrypted — is unchanged.
    const dek = unwrap(oldKey, row.wrappedDek);
    await rawPrisma.householdKey.update({
      where: { householdId: row.householdId },
      data: {
        wrappedDek: wrap(newKey, dek),
        keyVersion: { increment: 1 },
        rotatedAt: new Date(),
      },
    });
    rotated++;
  }

  console.log(`re-wrapped ${rotated} household keys; no row data was touched`);
  console.log("now set TOKEN_ENCRYPTION_KEY to the new value and restart");
  await rawPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
