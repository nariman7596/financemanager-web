import { prisma } from "@financemanager/db";

// Core ownership operations. Pure (no server-only / no auth) so they can be
// unit-tested; the Server Actions wrap these with checkHousehold("OWNER").

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
  if (!target) return { error: "Member not found" };
  if (target.userId === actingUserId) return { error: "You're already the owner" };
  if (target.role === "OWNER") return { error: "They're already an owner" };

  const mine = await prisma.membership.findUnique({
    where: { householdId_userId: { householdId, userId: actingUserId } },
  });
  if (!mine) return { error: "You're not a member of this household" };

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
    return { error: "You can't delete your only household — create or join another first" };
  }
  await prisma.household.delete({ where: { id: householdId } });
  return { ok: true };
}
