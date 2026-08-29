import { roleAtLeast, type Role } from "@financemanager/core/access";
import { prisma } from "./client";

// ---------------------------------------------------------------------------
// The household security core.
//
// Financial data is owned by a Household. This module answers one question --
// "which household may this user act in, and with what role?" -- and it answers
// it from a Membership row, never from anything the caller supplied.
//
// Both transports call this: the web app's Server Actions (via
// apps/web/src/lib/household.ts, which supplies the value of the fm_household
// cookie) and the NestJS API (via HouseholdGuard, which supplies the
// X-Household-Id header). A forged household id from either direction is
// therefore worth exactly nothing -- it is treated as a *preference*, and is
// used only if a real membership backs it.
// ---------------------------------------------------------------------------

export interface HouseholdContext {
  userId: string;
  householdId: string;
  role: Role;
}

/**
 * Resolve the household a user may act in.
 *
 * `wanted` is the caller's *preference* (a cookie, a header) and is honoured
 * only when a Membership proves it. Otherwise the user's first household is
 * used, so a stale or forged value degrades to "your own data" rather than
 * granting anything.
 *
 * Returns null when the user has no memberships at all.
 */
export async function resolveHouseholdContext(
  userId: string,
  wanted?: string | null,
): Promise<HouseholdContext | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.householdId === wanted) ?? memberships[0];
  return { userId, householdId: active.householdId, role: active.role as Role };
}

/** Does this context meet a minimum role? */
export function hasRole(ctx: HouseholdContext, minRole: Role): boolean {
  return roleAtLeast(ctx.role, minRole);
}

export type { Role };
