import { normalizeKeyword } from "./tracked-keywords";

/**
 * A keyword is one comma-separated item — a single word or a whole
 * sentence — and is searched exactly as written (see
 * docs/product/BILLING_DECISION.md §1). This splits what a user typed or
 * pasted ("acme, acme holding, yeni ürün lansmanı") into those items:
 * trimmed, inner whitespace collapsed, empties dropped, and repeats
 * removed (case- and Turkish-diacritic-insensitively) keeping the first
 * spelling. Line breaks also separate keywords, so a pasted column works.
 * Quotes are left alone; an item is never split on anything but commas.
 */
export function parseKeywordList(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(/[,\n\r]+/)) {
    const keyword = raw.replace(/\s+/g, " ").trim();
    if (!keyword) continue;
    const key = normalizeKeyword(keyword);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

/** Appends newly typed keywords to an existing list without duplicating any (same folding as above). */
export function mergeKeywords(existing: readonly string[], additions: readonly string[]): string[] {
  const seen = new Set(existing.map(normalizeKeyword));
  const merged = [...existing];
  for (const keyword of additions) {
    const key = normalizeKeyword(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(keyword);
  }
  return merged;
}
