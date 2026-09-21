"use client";

import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@cim/ui";
import { LogOut, User } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";

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
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{organizationName}</span>
      </div>
      <div className="flex items-center gap-3">
        <CommandPalette />
        <NotificationBell initialUnreadCount={initialUnreadCount} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Account menu">
              <User className="size-4" aria-hidden="true" />
              {userLabel}
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
