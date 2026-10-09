"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cim/ui";
import { Check, LogOut, User } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
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
  const t = useTranslations("shell.account");
  const locale = useLocale();
  const router = useRouter();
  const [switching, startTransition] = useTransition();

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
            <Button variant="ghost" size="sm" aria-label={t("menu")}>
              <User className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{userLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
            {LOCALES.map((code) => (
              <DropdownMenuItem
                key={code}
                disabled={switching}
                lang={code}
                aria-current={code === locale ? "true" : undefined}
                onSelect={() => {
                  if (code !== locale) startTransition(() => setLocale(code));
                }}
              >
                <span className="flex size-4 items-center justify-center" aria-hidden="true">
                  {code === locale ? <Check className="size-4" /> : null}
                </span>
                {LOCALE_LABELS[code]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="size-4" aria-hidden="true" />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
