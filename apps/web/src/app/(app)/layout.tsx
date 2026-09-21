import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [context, user] = await Promise.all([getOrgContext(), getCurrentUser()]);
  if (!context || !user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <AppTopbar
          organizationName={context.organizationName}
          userLabel={`${user.firstName} ${user.lastName}`}
        />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
