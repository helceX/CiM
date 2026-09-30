"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { Globe } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { LOCALES, LOCALE_LABELS, isLocale } from "@/i18n/config";

/**
 * Renders nothing until a second language exists, so adding a catalog is
 * the only step needed to make it appear (see i18n/config.ts).
 */
export function LanguageSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  if (LOCALES.length < 2) return null;

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <Globe aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-[var(--mk-muted)]" />
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) startTransition(() => setLocale(next));
        }}
        className="mk-btn mk-btn-ghost mk-btn-sm appearance-none py-0 pl-9 pr-3 disabled:opacity-60"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="bg-[#11132b] text-white">
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
