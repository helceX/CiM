import { turkishFold } from "./turkish";

/**
 * How a keyword is matched against text. The rule is "what you typed is what
 * is searched", with word boundaries — never a bare substring, which made a
 * short abbreviation such as "THY" or "AK" light up inside unrelated words
 * ("ARTHYMIA", "Akbank", "akşam").
 *
 *  - Whole word: the keyword must not touch another letter or digit on either
 *    side. Apostrophes, hyphens, spaces and punctuation are boundaries, so the
 *    Turkish proper-noun suffix ("Acme'nin", "THY'ye") still matches.
 *  - Phrases ("yapay zeka") match as a unit, any whitespace between the words.
 *  - A short ALL-CAPS keyword (2-6 letters/digits, e.g. THY, AK, BDDK, G20) is
 *    treated as an abbreviation and matched case-sensitively, so "AK" does not
 *    match the word "ak" (white). Type it in any other case ("Ak") for a
 *    case-insensitive match.
 *  - A trailing "*" opens the end of the word: "banka*" matches banka, bankalar,
 *    bankası. This is the explicit way to match Turkish suffixes on common nouns.
 */
export type KeywordMatchSpec = {
  /** The keyword without a trailing "*", whitespace collapsed. */
  core: string;
  /** Trailing "*": match any letters after it. */
  prefix: boolean;
  /** Short ALL-CAPS abbreviation: match case-sensitively. */
  caseSensitive: boolean;
};

const WORD = "\\p{L}\\p{N}";
const ABBREVIATION = /^[\p{Lu}\p{N}]+$/u;

export function parseKeywordSpec(term: string): KeywordMatchSpec {
  const collapsed = term.normalize("NFC").replace(/\s+/g, " ").trim();
  const prefix = collapsed.endsWith("*") && collapsed.replace(/\*+$/, "").length > 0;
  const core = collapsed.replace(/\*+$/, "").trim();
  const letters = core.match(/\p{L}/gu)?.length ?? 0;
  const caseSensitive =
    letters >= 1 && core.length >= 2 && core.length <= 6 && ABBREVIATION.test(core) && core === core.toLocaleUpperCase("tr-TR");
  return { core, prefix, caseSensitive };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const cache = new Map<string, { spec: KeywordMatchSpec; regex: RegExp | null }>();
const CACHE_LIMIT = 2000;

function compile(term: string) {
  let entry = cache.get(term);
  if (entry) return entry;
  const spec = parseKeywordSpec(term);
  let regex: RegExp | null = null;
  if (spec.core.length > 0) {
    const body = escapeRegex(spec.caseSensitive ? spec.core : turkishFold(spec.core)).replace(/ /g, "\\s+");
    const first = spec.core[0] ?? "";
    const last = spec.core[spec.core.length - 1] ?? "";
    const startsWord = /[\p{L}\p{N}]/u.test(first);
    const endsWord = /[\p{L}\p{N}]/u.test(last);
    const before = startsWord ? `(?<![${WORD}])` : "";
    const after = spec.prefix ? `[${WORD}]*` : endsWord ? `(?![${WORD}])` : "";
    regex = new RegExp(`${before}${body}${after}`, "u");
  }
  entry = { spec, regex };
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(term, entry);
  return entry;
}

/**
 * True when `term` occurs in the text under the rules above. `original` is the
 * text as published (for case-sensitive abbreviations); `folded` is the same text
 * after turkishFold (everything else).
 */
export function keywordMatches(term: string, texts: { original: string; folded: string }): boolean {
  const { spec, regex } = compile(term);
  if (!regex) return false;
  return regex.test(spec.caseSensitive ? texts.original.normalize("NFC") : texts.folded);
}

export function prepareText(text: string): { original: string; folded: string } {
  return { original: text, folded: turkishFold(text) };
}

/** Plain-language description of how a keyword will be matched, for the UI. */
export function describeKeywordMatch(term: string): string | null {
  const { core, prefix, caseSensitive } = parseKeywordSpec(term);
  if (!core) return null;
  const parts: string[] = [];
  parts.push(prefix ? `words that start with “${core}” (e.g. “${core}s”, “${core}'s” forms)` : `the whole word “${core}” only`);
  if (caseSensitive) parts.push("exact capitals (abbreviation)");
  return parts.join(", ");
}
