// Role definitions + comparison. Pure (no server-only) so it can be unit-tested
// and imported anywhere. Ranks: VIEWER < MEMBER < ADMIN < OWNER.

export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function roleAtLeast(role: string, min: Role): boolean {
  return (RANK[role as Role] ?? -1) >= RANK[min];
}
