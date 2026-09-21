import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Settings } from "lucide-react";

/**
 * Sidebar entries for sections that actually exist. Per brief §154, we
 * don't ship disabled/"coming soon" nav items that look like dead
 * features — Monitoring, Mentions, Alerts, Analytics, Reports, Sources,
 * and Projects are added here as each one ships (see
 * docs/product/FEATURE_MATRIX.md for what's next).
 */
export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];
