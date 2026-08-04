import { prisma } from "./prisma";

// Core ownership operations. Pure (no server-only / no auth) so they can be
// unit-tested; the Server Actions wrap these with checkHousehold("OWNER").
// `error` is an i18n key (see dictionaries `err.*`); the wrapping action
// translates it via `getT` before returning it to the client.

type Result = { ok: true; error?: undefined } | { ok?: undefined; error: string };

/**
 * Hand ownership to another member: the target becomes OWNER and the acting
 * owner steps down to ADMIN (single-owner hand-off). Atomic.
 */
export async function transferOwnershipTo(
  householdId: string,
  actingUserId: string,
  targetMembershipId: string,
): Promise<Result> {
  const target = await prisma.membership.findFirst({
    where: { id: targetMembershipId, householdId },
  });
  if (!target) return { error: "err.memberNotFound" };
  if (target.userId === actingUserId) return { error: "err.alreadyOwner" };
  if (target.role === "OWNER") return { error: "err.alreadyAnOwner" };

  const mine = await prisma.membership.findUnique({
    where: { householdId_userId: { householdId, userId: actingUserId } },
  });
  if (!mine) return { error: "err.notMemberOfThisHousehold" };

  await prisma.$transaction([
    prisma.membership.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.membership.update({ where: { id: mine.id }, data: { role: "ADMIN" } }),
  ]);
  return { ok: true };
}

/**
 * Delete a household and everything it owns (cascade). Blocked when it's the
 * acting user's only household, so they're never left without one.
 */
export async function deleteHouseholdFor(
  householdId: string,
  actingUserId: string,
): Promise<Result> {
  const count = await prisma.membership.count({ where: { userId: actingUserId } });
  if (count <= 1) {
    return { error: "err.cantDeleteOnlyHousehold" };
  }
  await prisma.household.delete({ where: { id: householdId } });
  return { ok: true };
}
