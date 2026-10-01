"use client";

import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@cim/ui";
import { LogOut, User } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function AppTopbar({
  organizationName,
  userLabel,
  initialUnreadCount,
}: {
  organizationName: string;
  userLabel: string;
  initialUnreadCount: number;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="mp-topbar flex h-16 items-center justify-between gap-2 px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <MobileNav />
        <span className="truncate font-medium text-foreground">{organizationName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <CommandPalette />
        <ThemeToggle />
        <NotificationBell initialUnreadCount={initialUnreadCount} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Account menu">
              <User className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{userLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
