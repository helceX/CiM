"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-config";
import { cn, Wordmark } from "@cim/ui";

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="mp-sidebar sticky top-0 hidden h-screen w-60 shrink-0 md:flex md:flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Mediaory dashboard" className="text-base text-foreground">
          <Wordmark className="font-extrabold tracking-tight" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "mp-nav-item flex items-center gap-3 px-2 py-1.5 text-sm font-medium",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="mp-nav-icon">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
