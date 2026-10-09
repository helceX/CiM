import { countryByCode } from "./regions";

/**
 * Two-letter endings that are sold to anyone, not to a country's own sites (.io, .tv, .me, .co …).
 * A site on one of these says nothing about where it is from.
 */
const NOT_A_COUNTRY_SIGNAL = new Set([
  "io", "ai", "co", "me", "tv", "fm", "cc", "ws", "to", "vc", "ly", "gl", "sh", "ac", "gg", "im", "nu", "la",
  "gd", "ms", "tk", "ml", "ga", "cf", "gq", "fo", "bz", "cx", "pw", "st", "sc", "mu", "so", "ag", "je", "ad",
  "cd", "am", "bio", "ne", "re", "ph", "tl",
]);

/**
 * The country a site most likely belongs to, read from the end of its address: bebka.org.tr → TR,
 * bbc.co.uk → GB, spiegel.de → DE. Only a country's own two-letter ending counts; .com/.org/.net and the
 * resold endings above return null — an unknown country is better than a wrong one, because the country
 * decides which monitorings a story can belong to.
 */
export function inferCountryFromHost(host: string | null | undefined): string | null {
  const tld = (host ?? "").trim().toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  if (tld.length !== 2 || NOT_A_COUNTRY_SIGNAL.has(tld)) return null;
  const code = tld === "uk" ? "GB" : tld.toUpperCase();
  return countryByCode(code) ? code : null;
}

const TURKISH_SOURCE_CUE = /\b(türkiye|turkiye|türk|turk|haber|gazete|gündem|gundem|ekonomi|teknoloji|girişim|girisim|son dakika|sağlık|saglik|yerel haber|ulusal haber|milliyet|cumhuriyet|sözcü|sozcu|köşe yazarı|kose yazari)\b/i;

export type SourceCountryHints = {
  name?: string | null;
  domain?: string | null;
  url?: string | null;
  language?: string | null;
};

/** Classify by explicit Turkish language/name/feed signals before falling back to the host's country-code ending. */
export function inferCountryFromSource(source: SourceCountryHints): string | null {
  const language = source.language?.trim().toLowerCase() ?? "";
  if (/^tr(?:$|[-_\s])/.test(language)) return "TR";

  let decodedUrl = source.url ?? "";
  try {
    decodedUrl = decodeURIComponent(decodedUrl.replace(/\+/g, " "));
  } catch {
    // Keep the original address if it contains malformed escapes.
  }
  const cues = `${source.name ?? ""} ${decodedUrl}`;
  if (/[ğşıİ]/.test(cues) || TURKISH_SOURCE_CUE.test(cues)) return "TR";

  const host = source.domain || (() => {
    try {
      return new URL(source.url ?? "").hostname;
    } catch {
      return "";
    }
  })();
  return inferCountryFromHost(host);
}
