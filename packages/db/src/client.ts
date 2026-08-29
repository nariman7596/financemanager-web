import { PrismaClient } from "@prisma/client";
import { withFieldEncryption } from "./encryption.extension";
import { withRevisionStamping } from "./revision.extension";

// Reuse a single PrismaClient across hot-reloads in development to avoid
// exhausting database connections.
//
// The exported client is wrapped by the field-encryption extension, so every
// consumer — Server Actions, the API, the seed, scripts — gets transparent
// encryption without having to remember it. `rawPrisma` is the unwrapped
// client, used only by the backfill and rotation tooling that has to see
// ciphertext as it really is on disk.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const rawPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawPrisma;

export const prisma = withRevisionStamping(
  withFieldEncryption(rawPrisma) as unknown as PrismaClient,
) as unknown as PrismaClient;
