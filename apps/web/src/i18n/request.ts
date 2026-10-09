import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { loadMessages } from "../../messages";
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, resolveLocale, type Locale } from "./config";

export default getRequestConfig(async () => {
  // Reading cookies()/headers() opts every page out of static rendering.
  // While only one language exists there is nothing to negotiate, so the
  // marketing pages stay static (fast, CDN-cacheable). The moment a second
  // catalog ships, negotiation switches on — and at that point prefer
  // locale-prefixed routes (/tr/...) for the marketing pages to get the
  // static rendering and hreflang back.
  let locale: Locale = DEFAULT_LOCALE;
  if (LOCALES.length > 1) {
    const resolved = resolveLocale({
      cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
      acceptLanguage: (await headers()).get("accept-language"),
    });
    if (isLocale(resolved)) locale = resolved;
  }

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
