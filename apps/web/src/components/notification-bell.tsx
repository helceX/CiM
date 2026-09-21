"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cim/ui";
import { Bell } from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || items !== null) return;
    setIsLoading(true);
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setItems(data.items))
      .finally(() => setIsLoading(false));
  }, [open, items]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  async function markRead(id: string) {
    setItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)) ?? null,
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }

  async function markAllRead() {
    setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null);
    setUnreadCount(0);
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}>
          <span className="relative">
            <Bell className="size-4" aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-medium text-danger-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-primary underline underline-offset-2"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !items || items.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={(event) => {
                  event.preventDefault();
                  if (!item.readAt) void markRead(item.id);
                }}
                className="flex-col items-start gap-0.5 whitespace-normal"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                  {!item.readAt ? <Badge tone="info">New</Badge> : null}
                </div>
                <span className="text-xs text-muted-foreground">{item.body}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
