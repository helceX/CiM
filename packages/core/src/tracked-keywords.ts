import type { QueryAst } from "./query-ast";
import { turkishFold } from "./turkish";

/**
 * docs/product/NEXT_FEATURES_SPEC.md §3 — the unit credit metering counts.
 *
 * A *tracked keyword* is a distinct, normalised include term or exact
 * phrase across an organization's active monitoring queries. Exclusions
 * are free (they narrow results, they don't watch anything). The same
 * word used in ten queries is still one keyword; an exact phrase is a
 * different thing to watch than the same words as a loose term, so the two
 * are namespaced apart. Normalisation uses the same Turkish-aware folding
 * as query matching, so "İstanbul" and "istanbul" are one keyword.
 */
export function normalizeKeyword(term: string): string {
  return turkishFold(term).replace(/\s+/g, " ").trim();
}

export function trackedKeywordSet(asts: readonly QueryAst[]): Set<string> {
  const keys = new Set<string>();
  for (const ast of asts) {
    for (const term of ast.include) {
      const normalized = normalizeKeyword(term);
      if (normalized) keys.add(`term:${normalized}`);
    }
    for (const phrase of ast.exactPhrases) {
      const normalized = normalizeKeyword(phrase);
      if (normalized) keys.add(`phrase:${normalized}`);
    }
  }
  return keys;
}

export function countTrackedKeywords(asts: readonly QueryAst[]): number {
  return trackedKeywordSet(asts).size;
}
