import { turkishFold } from "./turkish";

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
  const phraseTerms = ast.exactPhrases.map((phrase) => `"${phrase}"`);
  const includeClause = [...includeTerms, ...phraseTerms].join(" OR ");
  const excludeClause = ast.exclude.map((term) => `NOT ${quoteIfNeeded(term)}`).join(" AND ");

  const parts: string[] = [];
  if (includeClause) parts.push(includeTerms.length + phraseTerms.length > 1 ? `(${includeClause})` : includeClause);
  if (excludeClause) parts.push(excludeClause);
  return parts.join(" AND ");
}

function quoteIfNeeded(term: string): string {
  return term.includes(" ") ? `"${term}"` : term;
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
    const value = isPhrase ? token.slice(1, -1) : token;
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
  const regex = /"[^"]*"|\(|\)|[^\s()]+/g;
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
  const folded = turkishFold(text);

  const includeCandidates = [...ast.include, ...ast.exactPhrases];
  const hasInclude =
    includeCandidates.length === 0 ||
    includeCandidates.some((term) => folded.includes(turkishFold(term)));
  if (!hasInclude) return false;

  const hasExcluded = ast.exclude.some((term) => folded.includes(turkishFold(term)));
  return !hasExcluded;
}

/** Flags obviously ambiguous/too-broad single-term queries (brief §101). */
export function queryQualityWarning(ast: QueryAst): string | null {
  const totalTerms = ast.include.length + ast.exactPhrases.length;
  if (totalTerms === 1 && ast.exactPhrases.length === 0) {
    const term = ast.include[0] ?? "";
    if (term.length > 0 && term.length <= 6 && !term.includes(" ")) {
      return `"${term}" is a short, common-looking term and may return unrelated results. Consider an exact phrase or adding context terms.`;
    }
  }
  return null;
}
