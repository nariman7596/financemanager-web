import { requireHousehold, roleAtLeast } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import {
  InviteForm,
  RoleSelect,
  RemoveMemberButton,
  MakeOwnerButton,
  CancelInviteButton,
  InviteResponse,
  HouseholdSettingsForm,
  NewHouseholdForm,
  LeaveHouseholdButton,
  DeleteHouseholdButton,
} from "@/components/household-controls";

export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-brand-600 text-white",
  ADMIN: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  MEMBER: "surface-subtle text-[var(--muted)]",
  VIEWER: "surface-subtle text-[var(--muted)]",
};

export default async function HouseholdPage() {
  const ctx = await requireHousehold();
  const isAdmin = roleAtLeast(ctx.role, "ADMIN");
  const isOwner = ctx.role === "OWNER";

  const [household, myInvites] = await Promise.all([
    prisma.household.findUnique({
      where: { id: ctx.householdId },
      include: {
        members: { include: { user: true }, orderBy: { createdAt: "asc" } },
        invitations: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.invitation.findMany({
      where: { email: ctx.email.toLowerCase() },
      include: { household: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!household) return null;

  return (
    <>
      <Topbar title="Household" subtitle="Members, roles and invitations" />

      <div className="space-y-6">
        {myInvites.length > 0 && (
          <div className="card p-6 border-brand-200 dark:border-brand-500/30">
            <h2 className="font-semibold mb-3">Your invitations</h2>
            <ul className="space-y-2">
              {myInvites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm">
                    <span className="font-medium">{inv.household.name}</span>{" "}
                    <span className="text-slate-400">· as {inv.role.toLowerCase()}</span>
                  </span>
                  <InviteResponse id={inv.id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-6">
          <h2 className="font-semibold mb-4">{household.name}</h2>
          {isAdmin ? (
            <HouseholdSettingsForm name={household.name} baseCurrency={household.baseCurrency} />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Reporting currency: {household.baseCurrency}. Your role:{" "}
              <span className="capitalize">{ctx.role.toLowerCase()}</span> (only admins can change
              household settings).
            </p>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Members ({household.members.length})</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface-subtle text-[var(--muted)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium rounded-l-lg">Member</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 rounded-r-lg"></th>
                </tr>
              </thead>
              <tbody>
                {household.members.map((m) => {
                  const isSelf = m.userId === ctx.userId;
                  const editable = isAdmin && m.role !== "OWNER" && !isSelf;
                  return (
                    <tr key={m.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {m.user.name ?? m.user.email}
                          {isSelf && <span className="text-slate-400 font-normal"> (you)</span>}
                        </p>
                        <p className="text-xs text-slate-400">{m.user.email}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(m.createdAt)}</td>
                      <td className="px-3 py-2">
                        {editable ? (
                          <RoleSelect membershipId={m.id} role={m.role} />
                        ) : (
                          <span className={`badge capitalize ${ROLE_BADGE[m.role] ?? ""}`}>
                            {m.role.toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {isOwner && m.role !== "OWNER" && !isSelf && (
                            <MakeOwnerButton membershipId={m.id} name={m.user.name ?? m.user.email} />
                          )}
                          {editable && <RemoveMemberButton membershipId={m.id} name={m.user.name ?? m.user.email} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <InviteForm />
            </div>
          )}
        </div>

        {isAdmin && household.invitations.length > 0 && (
          <div className="card p-6">
            <h2 className="font-semibold mb-3">Pending invitations</h2>
            <ul className="space-y-2">
              {household.invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {inv.email} <span className="text-slate-400">· {inv.role.toLowerCase()}</span>
                  </span>
                  <CancelInviteButton id={inv.id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-6 space-y-6">
          <div>
            <h2 className="font-semibold mb-1">Create another household</h2>
            <p className="text-xs text-slate-400 mb-3">
              A separate shared space — e.g. a joint budget or a side project.
            </p>
            <NewHouseholdForm />
          </div>
          <div className="pt-4 border-t border-[var(--border)] flex flex-wrap items-start gap-6">
            <LeaveHouseholdButton />
            {isOwner && <DeleteHouseholdButton />}
          </div>
        </div>
      </div>
    </>
  );
}
