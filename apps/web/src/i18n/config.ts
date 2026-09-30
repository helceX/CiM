export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the locale for a request: an explicit cookie choice wins, then the
 * browser's Accept-Language (highest q-value first, matched on the primary
 * language subtag so "tr-TR" selects "tr"), then the default. Pure so it
 * can be tested with any supported set.
 */
export function resolveLocale(
  input: { cookie?: string | null; acceptLanguage?: string | null },
  supported: readonly string[] = LOCALES,
  fallback: string = DEFAULT_LOCALE,
): string {
  if (input.cookie && supported.includes(input.cookie)) return input.cookie;

  const ranked = (input.acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0] ?? "";
    if (supported.includes(tag)) return tag;
    if (supported.includes(primary)) return primary;
  }
  return fallback;
}
