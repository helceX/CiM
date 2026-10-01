/**
 * What we know about a story that appeared in a PRINTED edition — the data a
 * clipping provider (or a publisher's e-paper) can give us without us copying
 * the page itself: which title, which day's edition, which page, and where the
 * page can be viewed. We store only these references; the page image stays on
 * the provider's or publisher's servers and is linked, never mirrored.
 */
export type ArticlePrint = {
  /** The newspaper or magazine, e.g. "Cumhuriyet". */
  publication: string;
  /** The edition's date, YYYY-MM-DD. */
  editionDate: string | null;
  /** Page number within the edition. */
  page: number | null;
  /** Section or supplement, e.g. "Ekonomi". */
  section: string | null;
  /** Where the full page can be viewed (provider/e-paper viewer). */
  pageUrl: string | null;
  /** A preview image of the page or the clipping (https). */
  pageImageUrl: string | null;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** https only — a feed must not smuggle javascript:/http: links into the UI. */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Validates the `print` object of an incoming feed item. Anything that is not
 * well-formed is dropped rather than trusted; an item with no publication name
 * has no usable print data at all, so the whole object is null.
 */
export function parseArticlePrint(input: unknown): ArticlePrint | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const publication = cleanText(raw.publication, 120);
  if (!publication) return null;

  const date = typeof raw.editionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.editionDate) ? raw.editionDate : null;
  const validDate = date && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? date : null;
  const page = typeof raw.page === "number" && Number.isInteger(raw.page) && raw.page >= 1 && raw.page <= 9999 ? raw.page : null;

  return {
    publication,
    editionDate: validDate,
    page,
    section: cleanText(raw.section, 80),
    pageUrl: httpsUrl(raw.pageUrl),
    pageImageUrl: httpsUrl(raw.pageImageUrl),
  };
}

/** "Cumhuriyet · 1 Oct 2026 · p. 12" for the badge line. */
export function describeArticlePrint(print: ArticlePrint, locale?: string): string {
  const parts = [print.publication];
  if (print.editionDate) {
    parts.push(
      new Date(`${print.editionDate}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    );
  }
  if (print.page) parts.push(`p. ${print.page}`);
  return parts.join(" · ");
}
