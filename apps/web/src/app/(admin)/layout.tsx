import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

/**
 * docs/ux/SCREEN_INVENTORY.md §19 — "explicitly separated from tenant app
 * navigation/layout" (ADR-001, brief §86): this layout never renders the
 * organization sidebar/switcher `(app)/layout.tsx` uses, and nothing
 * under it resolves an organization context. A signed-in user who isn't
 * a Platform Super Admin gets a plain 404, not a redirect that would
 * confirm the panel exists and that they're merely unauthorized for it.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isPlatformSuperAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <span className="text-sm font-semibold text-foreground">CiM Admin</span>
          <span className="ml-2 text-xs text-muted-foreground">Platform Super Admin</span>
        </div>
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
