import { requireHousehold, listUserHouseholds } from "@/lib/household";
import { pendingInviteCount } from "@/lib/invites";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";

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

  const nav = {
    userName: ctx.name ?? ctx.email,
    role: ctx.role,
    activeHouseholdId: ctx.householdId,
    households,
    pendingInvites,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar {...nav} />
      {/* min-w-0 lets the column shrink below its content's intrinsic width,
          so a wide table scrolls inside its own container instead of pushing
          the whole page sideways. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav {...nav} />
        <main className="flex-1 min-w-0 w-full max-w-6xl mx-auto p-4 sm:p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
