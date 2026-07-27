import { requireHousehold, listUserHouseholds } from "@/lib/household";
import { pendingInviteCount } from "@/lib/invites";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireHousehold();
  const [households, pendingInvites] = await Promise.all([
    listUserHouseholds(ctx.userId),
    pendingInviteCount(ctx.email),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={ctx.name ?? ctx.email}
        role={ctx.role}
        activeHouseholdId={ctx.householdId}
        households={households}
        pendingInvites={pendingInvites}
      />
      <main className="flex-1 min-w-0 p-5 md:p-8 max-w-6xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
