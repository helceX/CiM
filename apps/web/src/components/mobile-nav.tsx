"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button, cn, Sheet, SheetContent, SheetTrigger } from "@cim/ui";
import { NAV_ITEMS } from "./nav-config";

/**
 * The sidebar is hidden below `md`; without this a phone had no way to
 * reach any section of the app. Same items, same active state, in a
 * left-anchored sheet that closes when a link is followed.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent title="Menu" className="left-0 right-auto max-w-xs border-l-0 border-r">
        <nav className="flex flex-col gap-0.5" aria-label="Primary (mobile)">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "mp-nav-item flex items-center gap-3 px-2 py-2 text-sm font-medium",
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
      </SheetContent>
    </Sheet>
  );
}
