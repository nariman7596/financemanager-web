import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  prisma,
  resolveHouseholdContext,
  type HouseholdContext as SharedHouseholdContext,
} from "@financemanager/db";
import { getSession } from "./session";
import { roleAtLeast, type Role } from "@financemanager/core/access";

// ---------------------------------------------------------------------------
// Household access control — the security core.
//
// Financial data is owned by a Household. Every request resolves the caller's
// ACTIVE household and their Membership role here; actions/queries then scope
// strictly by the returned householdId (which membership has proven the user
// can access) and gate writes by role. Nothing should query owned data by a
// householdId that didn't come from one of these helpers.
// ---------------------------------------------------------------------------

export { ROLES, roleAtLeast, type Role } from "@financemanager/core/access";

const ACTIVE_COOKIE = "fm_household";

// The shared context (userId/householdId/role) plus the display identity the
// web app's chrome needs. Resolution itself lives in @financemanager/db so the
// API enforces the identical policy — see ARCHITECTURE.md D1.
export interface HouseholdContext extends SharedHouseholdContext {
  email: string;
  name?: string | null;
}

/**
 * Resolve the caller's active household + role, or null if not usable.
 * Verifies the cookie's household against a real Membership; falls back to
 * the user's first membership when the cookie is missing/stale.
 */
export async function getActiveContext(): Promise<HouseholdContext | null> {
  const session = await getSession();
  if (!session) return null;

  const store = await cookies();
  const ctx = await resolveHouseholdContext(
    session.userId,
    store.get(ACTIVE_COOKIE)?.value,
  );
  if (!ctx) return null;

  // The web app also carries the signed-in identity for display.
  return { ...ctx, email: session.email, name: session.name };
}

/**
 * Require an authenticated user who is a member of the active household with
 * at least `minRole`. Redirects to /login when unauthenticated; throws a
 * FORBIDDEN error when the role is insufficient (mutations should catch and
 * surface this as an error result).
 */
export async function requireHousehold(
  minRole: Role = "VIEWER",
): Promise<HouseholdContext> {
  const ctx = await getActiveContext();
  if (!ctx) redirect("/login");
  if (!roleAtLeast(ctx.role, minRole)) {
    throw new Error("FORBIDDEN: you don't have permission to do that");
  }
  return ctx;
}

/**
 * Non-throwing guard for mutations. Returns `{ ctx }` when the caller is a
 * member of the active household with at least `minRole`, otherwise `{ error }`.
 * Actions return the error to the form instead of throwing.
 */
export async function checkHousehold(
  minRole: Role = "MEMBER",
): Promise<{ ctx: HouseholdContext; error?: undefined } | { ctx?: undefined; error: string }> {
  const ctx = await getActiveContext();
  if (!ctx) return { error: "You're not signed in" };
  if (!roleAtLeast(ctx.role, minRole)) {
    return { error: `You need ${minRole.toLowerCase()} access to do that` };
  }
  return { ctx };
}

/** Set the active household cookie — only if the user is actually a member. */
export async function setActiveHousehold(householdId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const membership = await prisma.membership.findUnique({
    where: { householdId_userId: { householdId, userId: session.userId } },
  });
  if (!membership) return false;
  const store = await cookies();
  store.set(ACTIVE_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

/** Clear the active-household cookie (e.g. after deleting/leaving it). */
export async function clearActiveHousehold() {
  const store = await cookies();
  store.delete(ACTIVE_COOKIE);
}

export const ACTIVE_HOUSEHOLD_COOKIE = ACTIVE_COOKIE;

/** All households the current user belongs to (with their role + counts). */
export async function listUserHouseholds(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { household: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    householdId: m.householdId,
    name: m.household.name,
    baseCurrency: m.household.baseCurrency,
    role: m.role as Role,
    memberCount: m.household._count.members,
  }));
}
