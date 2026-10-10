import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BarChart3,
  ChartColumn,
  BellRing,
  FileText,
  Inbox,
  LayoutDashboard,
  Radar,
  Settings,
  Share2,
  Target,
  Users,
} from "lucide-react";

/** The key of a sidebar entry in the `shell.nav` catalog namespace (its label is translated where it is shown). */
export type NavKey =
  | "dashboard"
  | "monitoring"
  | "mentions"
  | "opportunities"
  | "social"
  | "alerts"
  | "analytics"
  | "visuals"
  | "reports"
  | "archive"
  | "team"
  | "settings";

/**
 * Sidebar entries for sections that actually exist. Per brief §154, we
 * don't ship disabled/"coming soon" nav items that look like dead
 * features — Reports, Sources, and Projects are added here as each one
 * ships (see docs/product/FEATURE_MATRIX.md for what's next).
 */
export const NAV_ITEMS: { href: string; key: NavKey; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/monitoring", key: "monitoring", icon: Radar },
  { href: "/mentions", key: "mentions", icon: Inbox },
  { href: "/opportunities", key: "opportunities", icon: Target },
  { href: "/social", key: "social", icon: Share2 },
  { href: "/alerts", key: "alerts", icon: BellRing },
  { href: "/analytics", key: "analytics", icon: BarChart3 },
  { href: "/visuals", key: "visuals", icon: ChartColumn },
  { href: "/reports", key: "reports", icon: FileText },
  { href: "/archive", key: "archive", icon: Archive },
  { href: "/team", key: "team", icon: Users },
  { href: "/settings", key: "settings", icon: Settings },
];
