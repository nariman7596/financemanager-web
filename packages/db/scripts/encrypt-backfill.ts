/**
 * Convert existing plaintext rows to encrypted ones.
 *
 * Safe to run repeatedly and safe to run while the app is up: encryption is
 * switched on for new writes by the deploy, existing rows stay readable
 * because plaintext passes through untouched, and this converts them
 * afterwards. Nothing has to stop.
 *
 *   pnpm --filter @financemanager/db encrypt:backfill [--dry-run]
 */
import { rawPrisma } from "../src/client";
import { decryptLegacy, encryptField, isEncrypted } from "../src/crypto";

const dryRun = process.argv.includes("--dry-run");
const BATCH = 500;

async function main() {
  let converted = 0;
  let skipped = 0;

  for (;;) {
    const rows = await rawPrisma.transaction.findMany({
      where: {
        OR: [
          { description: { not: null } },
          { notes: { not: null } },
          { rawSms: { not: null } },
        ],
      },
      select: { id: true, householdId: true, description: true, notes: true, rawSms: true },
      take: BATCH,
      skip: converted + skipped,
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const field of ["description", "notes", "rawSms"] as const) {
        const value = row[field];
        if (typeof value === "string" && !isEncrypted(value)) {
          data[field] = await encryptField(row.householdId, value);
        }
      }
      if (Object.keys(data).length === 0) {
        skipped++;
        continue;
      }
      // rawPrisma on purpose: the values are already ciphertext, and going
      // through the extension would try to encrypt them a second time.
      if (!dryRun) {
        await rawPrisma.transaction.update({ where: { id: row.id }, data });
      }
      converted++;
    }
  }

  // Plaid tokens were encrypted with the ORIGINAL format, straight under the
  // master key. Convert them into the envelope so there is one scheme.
  let tokens = 0;
  for (const item of await rawPrisma.plaidItem.findMany({
    select: { id: true, householdId: true, accessToken: true },
  })) {
    if (isEncrypted(item.accessToken)) continue;
    const plain = decryptLegacy(item.accessToken) ?? item.accessToken;
    if (!dryRun) {
      await rawPrisma.plaidItem.update({
        where: { id: item.id },
        data: { accessToken: await encryptField(item.householdId, plain) },
      });
    }
    tokens++;
  }

  console.log(
    `${dryRun ? "[dry run] would convert" : "converted"}: ` +
      `${converted} transactions, ${tokens} Plaid tokens (${skipped} already encrypted)`,
  );
  await rawPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
