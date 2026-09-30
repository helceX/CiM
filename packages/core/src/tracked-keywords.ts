import type { QueryAst } from "./query-ast";
import { turkishFold } from "./turkish";

/**
 * docs/product/NEXT_FEATURES_SPEC.md §3 — the unit credit metering counts.
 *
 * A *tracked keyword* is one comma-separated item the customer entered —
 * a single word or a whole sentence (docs/product/BILLING_DECISION.md §1) —
 * i.e. a distinct, normalised include term or exact phrase across the
 * organization's active monitoring queries. Both are searched by the same
 * text match, so identical text counts once however it was entered, and
 * the same keyword used in ten queries is still one keyword. Exclusions
 * are free (they narrow results, they don't watch anything). Normalisation
 * uses the same Turkish-aware folding as query matching, so "İstanbul" and
 * "istanbul" are one keyword.
 */
export function normalizeKeyword(term: string): string {
  return turkishFold(term).replace(/\s+/g, " ").trim();
}

export function trackedKeywordSet(asts: readonly QueryAst[]): Set<string> {
  const keys = new Set<string>();
  for (const ast of asts) {
    for (const term of ast.include) {
      const normalized = normalizeKeyword(term);
      if (normalized) keys.add(normalized);
    }
    for (const phrase of ast.exactPhrases) {
      const normalized = normalizeKeyword(phrase);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

export function countTrackedKeywords(asts: readonly QueryAst[]): number {
  return trackedKeywordSet(asts).size;
}
