import { Crosshair } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { AppSidebar } from "@/components/layout/Sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  return (
    <SidebarProvider className="h-screen overflow-hidden bg-background">
      <AppSidebar user={{ name: user.name, email: user.email }} company={company} />
      <SidebarInset className="overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border bg-sidebar px-4 md:hidden">
          <SidebarTrigger />
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Crosshair className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            ProspFlow
          </span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
