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

export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  // Only the server-computed count before the list has ever been
  // fetched — once `items` is non-null, `unreadCount` below derives
  // straight from it instead, so markRead/markAllRead never need to
  // maintain a separate counter that could drift from the list itself.
  const [fallbackUnreadCount, setFallbackUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = items
    ? items.filter((item) => !item.readAt).length
    : fallbackUnreadCount;

  // apps/web/src/app/(app)/layout.tsx recomputes initialUnreadCount fresh
  // on every server render (each navigation within the (app) layout),
  // but this component itself stays mounted across those navigations —
  // useState's initializer only runs once, so without this effect the
  // badge/list would go stale as soon as the user left the page they
  // first opened the bell on. Clearing `items` forces a refetch next
  // time the dropdown opens, rather than showing a stale list forever.
  useEffect(() => {
    setFallbackUnreadCount(initialUnreadCount);
    setItems(null);
  }, [initialUnreadCount]);

  useEffect(() => {
    if (!open || items !== null) return;
    setIsLoading(true);
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [open, items]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  async function markRead(id: string) {
    setError(null);
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ) ?? null,
    );
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      if (!response.ok) throw new Error("request failed");
    } catch {
      // Reverts only this one item against whatever `items` currently
      // holds, not a snapshot captured before this call — clicking
      // "Mark all read" while this request is still in flight applies
      // its own optimistic update to every item in between; restoring a
      // stale full-list snapshot here would silently undo that unrelated,
      // possibly-successful update too. Same stale-snapshot bug class
      // already fixed in mention-detail-drawer.tsx.
      setItems(
        (current) =>
          current?.map((item) => (item.id === id ? { ...item, readAt: null } : item)) ??
          null,
      );
      setError("Couldn't mark that as read. Please try again.");
    }
  }

  async function markAllRead() {
    // The ids this call is actually responsible for — captured now so a
    // failure only reverts *these*, not whatever `items` holds by the
    // time the request comes back (which a concurrent markRead(id) may
    // have since moved past).
    const idsBeingMarked = new Set(
      items?.filter((item) => !item.readAt).map((item) => item.id) ?? [],
    );
    setError(null);
    setItems(
      (current) =>
        current?.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })) ?? null,
    );
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!response.ok) throw new Error("request failed");
    } catch {
      setItems(
        (current) =>
          current?.map((item) =>
            idsBeingMarked.has(item.id) ? { ...item, readAt: null } : item,
          ) ?? null,
      );
      setError("Couldn't mark all as read. Please try again.");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
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
        {error ? (
          <p role="alert" className="px-2.5 pb-1.5 text-xs text-danger">
            {error}
          </p>
        ) : null}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : !items || items.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
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
                  <span className="text-sm font-medium text-foreground">
                    {item.title}
                  </span>
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
