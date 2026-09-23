/**
 * docs/architecture/SECURITY.md — "Scraped HTML is sanitized (script/
 * iframe/event-handlers stripped) before any excerpt is rendered." The
 * `RawFetchResult` contract (connector.ts) carries `bodyText`, not HTML —
 * every connector that touches real HTML converts it to plain text here,
 * once, at the ingestion boundary, so there is no HTML left downstream
 * for a script/iframe/handler to survive in.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint =
        entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (Number.isNaN(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Deliberately not a full DOM parse (Readability-style main-content
 * extraction is out of MVP scope) — strips the tags that carry no
 * reader-visible text at all (script/style/comments), any tag with an
 * `on*=` handler attribute or an `<iframe>`, then every remaining tag,
 * and collapses whitespace. Never preserves markup, so there is nothing
 * left for a stored/rendered excerpt to execute.
 */
export function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ");
  text = text.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<[a-z][^>]*\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  // An entity-encoded tag (`&lt;script&gt;`) isn't a `<...>` token yet
  // when the strip pass above runs, so it survives decoding as literal
  // tag-shaped text — this second, narrower pass catches exactly that,
  // so nothing tag-shaped is left in the output regardless of how it
  // was encoded in the source, matching this module's own contract.
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Same decode-then-strip discipline as htmlToPlainText, for the short strings extractTitle captures. */
function sanitizeExtractedText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html: string): string | null {
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
  if (ogTitle?.[1]) return sanitizeExtractedText(ogTitle[1]);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag?.[1]) return sanitizeExtractedText(titleTag[1]);
  return null;
}
