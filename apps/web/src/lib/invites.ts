import { prisma } from "@financemanager/db";

/**
 * Convert any pending invitations addressed to `email` into memberships for
 * `userId`. Called on registration (and can be surfaced in-app for existing
 * users). Idempotent. Returns how many invites were accepted.
 */
export async function acceptInvitesForUser(
  userId: string,
  email: string,
): Promise<number> {
  const invites = await prisma.invitation.findMany({
    where: { email: email.toLowerCase() },
  });
  for (const inv of invites) {
    await prisma.membership.upsert({
      where: { householdId_userId: { householdId: inv.householdId, userId } },
      create: { householdId: inv.householdId, userId, role: inv.role },
      update: {},
    });
    await prisma.invitation.delete({ where: { id: inv.id } });
  }
  return invites.length;
}

/** Count pending invitations for an email (to surface in the UI). */
export async function pendingInviteCount(email: string): Promise<number> {
  return prisma.invitation.count({ where: { email: email.toLowerCase() } });
}
