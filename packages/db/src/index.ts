// The only package allowed to import @prisma/client (ARCHITECTURE.md §2).
// Both transports — the Next.js app's Server Actions and the NestJS API —
// share this client and this schema, so there is one data model rather than
// two that drift.
export { prisma } from "./client";
export { Prisma, PrismaClient } from "@prisma/client";
export type * from "@prisma/client";

// Household bootstrap + the default category tree. These write through Prisma,
// so they live here rather than in packages/core (which must run in Hermes),
// and both the web app and the API create households the same way.
export {
  createHousehold,
  seedDefaultsForHousehold,
  seedDefaultCategories,
  relabelDefaults,
  DEFAULT_ACCOUNT_NAME,
} from "./defaults";

// The household security core, shared by the web app and the API.
export {
  resolveHouseholdContext,
  hasRole,
  type HouseholdContext,
  type Role,
} from "./access";

export { nextRevision } from "./revision";
