"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin#job-queues", label: "Job queues", match: "/admin/jobs" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/takedowns", label: "Takedowns" },
] as const;

/** Persistent admin navigation — every admin area is one click away, no typing URLs. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-1 border-b border-border px-6 py-2">
      {ITEMS.map((item) => {
        const base = "match" in item ? item.match : item.href;
        const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(base);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/dashboard"
        className="ml-auto rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        ← Back to app
      </Link>
    </nav>
  );
}
