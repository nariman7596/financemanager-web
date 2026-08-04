import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSession } from "./session";
import { roleAtLeast, type Role } from "./roles";
import { getT } from "./i18n/server";

// ---------------------------------------------------------------------------
// Household access control — the security core.
//
// Financial data is owned by a Household. Every request resolves the caller's
// ACTIVE household and their Membership role here; actions/queries then scope
// strictly by the returned householdId (which membership has proven the user
// can access) and gate writes by role. Nothing should query owned data by a
// householdId that didn't come from one of these helpers.
// ---------------------------------------------------------------------------

export { ROLES, roleAtLeast, type Role } from "./roles";

const ACTIVE_COOKIE = "fm_household";

export interface HouseholdContext {
  userId: string;
  email: string;
  name?: string | null;
  householdId: string;
  role: Role;
}

/**
 * Resolve the caller's active household + role, or null if not usable.
 * Verifies the cookie's household against a real Membership; falls back to
 * the user's first membership when the cookie is missing/stale.
 */
export async function getActiveContext(): Promise<HouseholdContext | null> {
  const session = await getSession();
  if (!session) return null;

  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const store = await cookies();
  const wanted = store.get(ACTIVE_COOKIE)?.value;
  const active =
    memberships.find((m) => m.householdId === wanted) ?? memberships[0];

  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    householdId: active.householdId,
    role: active.role as Role,
  };
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
  const t = await getT();
  if (!ctx) return { error: t("err.notSignedIn") };
  if (!roleAtLeast(ctx.role, minRole)) {
    return { error: t("err.needAccess", { role: t(`enum.role.${minRole}`) }) };
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
