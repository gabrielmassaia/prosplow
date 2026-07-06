import { requireCompany, requireUser } from "@/lib/tenant";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={{ name: user.name, email: user.email }} company={company} />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
