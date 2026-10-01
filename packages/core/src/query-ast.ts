import { keywordMatches, prepareText } from "./keyword-match";

/**
 * docs/architecture/SEARCH.md — one canonical AST shared by the Simple
 * (chip) editor, the Advanced (Boolean syntax) editor, ingestion-time
 * matching, and query preview. Switching editor modes is lossless in
 * both directions because both modes read/write this same shape.
 *
 * MVP scope: AND-of-includes, OR within a group is not yet supported —
 * NEAR/wildcards are noted as a stretch goal in SEARCH.md and are not
 * implemented here yet (kept out rather than half-built, brief §129).
 */
export type QueryAst = {
  include: string[];
  exclude: string[];
  exactPhrases: string[];
};

export function emptyQueryAst(): QueryAst {
  return { include: [], exclude: [], exactPhrases: [] };
}

/** Renders a QueryAst to its canonical Boolean string form. */
export function astToBooleanQuery(ast: QueryAst): string {
  const includeTerms = ast.include.map((term) => quoteIfNeeded(term));
  const phraseTerms = ast.exactPhrases.map((phrase) => `"${escapeQuoted(phrase)}"`);
  const includeClause = [...includeTerms, ...phraseTerms].join(" OR ");
  const excludeClause = ast.exclude
    .map((term) => `NOT ${quoteIfNeeded(term)}`)
    .join(" AND ");

  const parts: string[] = [];
  if (includeClause)
    parts.push(
      includeTerms.length + phraseTerms.length > 1
        ? `(${includeClause})`
        : includeClause,
    );
  if (excludeClause) parts.push(excludeClause);
  return parts.join(" AND ");
}

// A term/phrase containing a literal `"` or `\` must be escaped before
// quoting, or tokenize()'s closing-quote match lands on that embedded
// character instead of the real end of the term — silently corrupting
// this AST on the next parseBooleanQuery() round-trip (the module's own
// "lossless in both directions" guarantee above).
function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeQuoted(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      result += value[i + 1];
      i++;
    } else {
      result += value[i];
    }
  }
  return result;
}

function quoteIfNeeded(term: string): string {
  // A term starting with a literal `"` must be quoted too, or tokenize()'s
  // phrase alternative starts matching right at that character and can
  // swallow everything up to some unrelated later term's closing quote —
  // an embedded (non-leading) quote is safe unquoted (parseBooleanQuery
  // only treats a token as a phrase when it starts AND ends with `"`,
  // reclassifying it from `include` to `exactPhrases` — reserved for the
  // one case where leaving it unquoted risks corrupting other terms).
  return term.includes(" ") || term.startsWith('"') ? `"${escapeQuoted(term)}"` : term;
}

/**
 * Parses Advanced-mode Boolean syntax back into a QueryAst. Supports
 * AND/OR/NOT and quoted exact phrases — a pragmatic subset (see MVP
 * scope note above), not a full Boolean-logic evaluator with operator
 * precedence/grouping; nested parentheses are flattened rather than
 * silently mis-evaluated.
 */
export function parseBooleanQuery(input: string): QueryAst {
  const ast = emptyQueryAst();
  const tokens = tokenize(input);

  let pendingNegation = false;
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (upper === "AND" || upper === "OR") continue;
    if (upper === "NOT") {
      pendingNegation = true;
      continue;
    }
    const isPhrase = token.startsWith('"') && token.endsWith('"');
    const value = isPhrase ? unescapeQuoted(token.slice(1, -1)) : token;
    if (!value) continue;

    if (pendingNegation) {
      ast.exclude.push(value);
    } else if (isPhrase) {
      ast.exactPhrases.push(value);
    } else {
      ast.include.push(value);
    }
    pendingNegation = false;
  }
  return ast;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  // \\. before the negated class so an escaped quote (\") inside a
  // phrase is consumed as part of the phrase's content instead of
  // ending the match early at that embedded quote.
  const regex = /"(?:\\.|[^"\\])*"|\(|\)|[^\s()]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    const token = match[0];
    if (token === "(" || token === ")") continue;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Evaluates a QueryAst against normalized article text. Used both by the
 * (future) ingestion query-match stage and by "Preview results" so the
 * two never diverge in what counts as a match.
 */
export function matchesText(ast: QueryAst, text: string): boolean {
  const texts = prepareText(text);

  const includeCandidates = [...ast.include, ...ast.exactPhrases];
  const hasInclude =
    includeCandidates.length === 0 ||
    includeCandidates.some((term) => keywordMatches(term, texts));
  if (!hasInclude) return false;

  const hasExcluded = ast.exclude.some((term) => keywordMatches(term, texts));
  return !hasExcluded;
}

/**
 * A transparent, explainable MVP relevance signal (docs/architecture/
 * ARCHITECTURE.md notes the full weighted Media Impact Score — brief
 * §27 — as later-phase scope): an exact-phrase match is a stronger
 * signal than a loose include-term match, so it's surfaced as "high"
 * priority. This is what the "high relevance" alert type checks against
 * — never a fabricated confidence number.
 */
export function computeMatchPriority(ast: QueryAst, text: string): "high" | "normal" {
  const texts = prepareText(text);
  const hasExactPhraseMatch = ast.exactPhrases.some((phrase) => keywordMatches(phrase, texts));
  return hasExactPhraseMatch ? "high" : "normal";
}

/**
 * The term/phrase that actually satisfied `matchesText`, for the "Why
 * matched?" UI (docs/architecture/ADR-006-SOCIAL-LISTENING.md) — exact
 * phrases take priority over loose include terms since they're the
 * stronger signal (mirrors computeMatchPriority's own ordering). Null
 * when the query has no include/exactPhrase terms at all (the
 * vacuously-true case matchesText itself falls back to).
 */
export function findMatchedTerm(ast: QueryAst, text: string): string | null {
  const texts = prepareText(text);
  for (const phrase of ast.exactPhrases) {
    if (keywordMatches(phrase, texts)) return phrase;
  }
  for (const term of ast.include) {
    if (keywordMatches(term, texts)) return term;
  }
  return null;
}

export type MatchType =
  | "direct_mention"
  | "hashtag"
  | "url"
  | "exact_name"
  | "contextual";

const URL_LIKE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

/**
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — a deterministic,
 * non-AI classification of *how* a term matched, driven by the matched
 * term's own shape (an "@handle", a "#hashtag", a domain/URL, an exact
 * multi-word phrase, or a loose keyword). Two match types from the CiM
 * V2 master prompt's taxonomy are deliberately NOT produced here:
 * `alias` (needs the EntityAlias table wired into MonitoringQuery
 * matching — not yet built) and `semantic` (an AI capability, per the
 * ADR — never guessed by string shape). A term this function can't
 * confidently classify falls back to "contextual" rather than fabricating
 * a more specific type.
 */
export function classifyMatchType(
  ast: QueryAst,
  matchedTerm: string,
  sourceType: string,
): { matchType: MatchType; matchedRule: string } {
  if (sourceType === "social" && matchedTerm.startsWith("@")) {
    return {
      matchType: "direct_mention",
      matchedRule: `Matched direct mention: "${matchedTerm}"`,
    };
  }
  if (matchedTerm.startsWith("#")) {
    return { matchType: "hashtag", matchedRule: `Matched hashtag: "${matchedTerm}"` };
  }
  if (URL_LIKE.test(matchedTerm.trim())) {
    return { matchType: "url", matchedRule: `Matched URL/domain: "${matchedTerm}"` };
  }
  if (ast.exactPhrases.includes(matchedTerm)) {
    return {
      matchType: "exact_name",
      matchedRule: `Matched exact phrase: "${matchedTerm}"`,
    };
  }
  return { matchType: "contextual", matchedRule: `Matched keyword: "${matchedTerm}"` };
}

/** Flags obviously ambiguous/too-broad single-term queries (brief §101). */
export function queryQualityWarning(ast: QueryAst): string | null {
  const totalTerms = ast.include.length + ast.exactPhrases.length;
  if (totalTerms === 1 && ast.exactPhrases.length === 0) {
    const term = ast.include[0] ?? "";
    if (term.length > 0 && term.length <= 6 && !term.includes(" ")) {
      // Whole-word matching already stops "THY" matching inside "ARTHYMIA"; what is
      // left is a short word that is simply common in its own right.
      return `"${term}" is short and may still match unrelated stories as a whole word. Consider a longer name or an exact phrase.`;
    }
  }
  return null;
}
