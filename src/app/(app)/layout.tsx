import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name ?? user.email} />
      <main className="flex-1 min-w-0 p-5 md:p-8 max-w-6xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
