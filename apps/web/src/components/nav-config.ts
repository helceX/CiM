import type { LucideIcon } from "lucide-react";
import { BarChart3, BellRing, FileText, Inbox, LayoutDashboard, Radar, Settings } from "lucide-react";

/**
 * Sidebar entries for sections that actually exist. Per brief §154, we
 * don't ship disabled/"coming soon" nav items that look like dead
 * features — Reports, Sources, and Projects are added here as each one
 * ships (see docs/product/FEATURE_MATRIX.md for what's next).
 */
export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/monitoring", label: "Monitoring", icon: Radar },
  { href: "/mentions", label: "Mentions", icon: Inbox },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];
