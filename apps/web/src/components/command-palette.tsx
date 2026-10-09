"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { NAV_ITEMS } from "./nav-config";

/**
 * Cmd/Ctrl+K — navigation today (every sidebar page); actions and object search (mentions,
 * sources, reports, saved views) register as those modules ship,
 * per docs/ux/INFORMATION_ARCHITECTURE.md's pluggable-provider design.
 */
export function CommandPalette() {
  const t = useTranslations("palette");
  const nav = useTranslations("shell.nav");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    // Lower-cased in the person's language: Turkish "İ" and "I" lower-case differently from English.
    const needle = query.toLocaleLowerCase(locale);
    return NAV_ITEMS.map((item) => ({ item, page: nav(item.key) }))
      .filter(({ page }) => page.toLocaleLowerCase(locale).includes(needle))
      .map(({ item, page }) => ({
        id: item.href,
        label: t("goTo", { page }),
        run: () => router.push(item.href),
      }));
  }, [query, router, locale, nav, t]);

  // Selecting a result already clears the query (below); closing any other
  // way (Escape, overlay click) must too — otherwise the palette stays
  // mounted with the last, never-acted-on search, so reopening it shows
  // stale results until the user notices and clears the input themselves.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger
        className="flex h-8 items-center gap-2 rounded border border-border bg-surface px-2.5 text-sm text-muted-foreground hover:bg-surface-muted"
        aria-label={t("open")}
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{t("search")}</span>
        <kbd className="ml-4 hidden sm:inline rounded-sm border border-border-strong px-1 text-[10px]">
          ⌘K
        </kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-surface shadow-lg"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t("title")}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("label")}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("noMatches")}
              </li>
            ) : (
              results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => {
                      result.run();
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                  >
                    {result.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
