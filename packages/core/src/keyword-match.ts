import { inflectedWordPattern, morphologyKey } from "./morphology";
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
const CACHE_LIMIT = 4000;
const NON_WORD = `[^${WORD}]`;

/** Everything about the text a keyword is matched in that can change what matches. */
export type MatchOptions = {
  /** Language of the text (ISO code); decides which word endings a keyword may take. */
  language?: string | null;
};

/**
 * The folded keyword as a pattern: its words joined by whatever the keyword used between them
 * (a space → any whitespace; an apostrophe, hyphen, dot, comma… → any punctuation or nothing, so
 * "O'Reilly", "O’Reilly" and "O Reilly" all agree), and the last word open to its inflections.
 */
function foldedPattern(core: string, prefix: boolean, language: string | null | undefined): string {
  const leading = core.match(new RegExp(`^${NON_WORD}*`, "u"))?.[0] ?? "";
  const trailing = core.slice(leading.length).match(new RegExp(`${NON_WORD}*$`, "u"))?.[0] ?? "";
  const middle = core.slice(leading.length, core.length - trailing.length);
  const parts = middle.split(new RegExp(`(${NON_WORD}+)`, "u"));
  let pattern = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    if (i % 2 === 1) {
      pattern += /^\s+$/.test(part) ? "\\s+" : `${NON_WORD}{0,3}`;
    } else if (i === parts.length - 1 && !prefix && trailing === "") {
      pattern += inflectedWordPattern(part, language);
    } else {
      pattern += part;
    }
  }
  return `${escapeRegex(leading)}${pattern}${escapeRegex(trailing)}`;
}

function compile(term: string, language: string | null | undefined) {
  const key = `${morphologyKey(language)}\u0000${term}`;
  let entry = cache.get(key);
  if (entry) return entry;
  const spec = parseKeywordSpec(term);
  let regex: RegExp | null = null;
  if (spec.core.length > 0) {
    const first = spec.core[0] ?? "";
    const last = spec.core[spec.core.length - 1] ?? "";
    const startsWord = /[\p{L}\p{N}]/u.test(first);
    const endsWord = /[\p{L}\p{N}]/u.test(last);
    const before = startsWord ? `(?<![${WORD}])` : "";
    const after = spec.prefix ? `[${WORD}]*` : endsWord ? `(?![${WORD}])` : "";
    // An abbreviation (THY) is exact; every other keyword may be inflected.
    const body = spec.caseSensitive
      ? escapeRegex(spec.core).replace(/ /g, "\\s+")
      : foldedPattern(turkishFold(spec.core), spec.prefix, language);
    regex = new RegExp(`${before}${body}${after}`, "u");
  }
  entry = { spec, regex };
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, entry);
  return entry;
}

/**
 * True when `term` occurs in the text under the rules above. `original` is the
 * text as published (for case-sensitive abbreviations); `folded` is the same text
 * after turkishFold (everything else).
 */
export function keywordMatches(term: string, texts: { original: string; folded: string }, options: MatchOptions = {}): boolean {
  const { spec, regex } = compile(term, options.language);
  if (!regex) return false;
  return regex.test(spec.caseSensitive ? texts.original.normalize("NFC") : texts.folded);
}

/**
 * A story is matched against every active monitoring (hundreds of them) one after another, each asking for the
 * same text to be folded. The last few texts are remembered, so a story is folded once per crawl, not once per
 * monitoring. Small and bounded; a long text is not worth keeping.
 */
const PREPARED_MAX = 32;
const PREPARED_TEXT_MAX_CHARS = 20_000;
const prepared = new Map<string, { original: string; folded: string }>();

export function prepareText(text: string): { original: string; folded: string } {
  const hit = prepared.get(text);
  if (hit) return hit;
  const value = { original: text, folded: turkishFold(text) };
  if (text.length <= PREPARED_TEXT_MAX_CHARS) {
    if (prepared.size >= PREPARED_MAX) prepared.delete(prepared.keys().next().value as string);
    prepared.set(text, value);
  }
  return value;
}

/** Plain-language description of how a keyword will be matched, for the UI. */
export function describeKeywordMatch(term: string): string | null {
  const { core, prefix, caseSensitive } = parseKeywordSpec(term);
  if (!core) return null;
  const parts: string[] = [];
  parts.push(
    prefix
      ? `words that start with “${core}” (e.g. “${core}s”, “${core}'s” forms)`
      : caseSensitive
        ? `the whole word “${core}” only`
        : `the whole word “${core}” and its forms (plural, possessive and case endings)`,
  );
  if (caseSensitive) parts.push("exact capitals (abbreviation)");
  return parts.join(", ");
}
