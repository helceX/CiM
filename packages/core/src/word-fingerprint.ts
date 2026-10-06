import { parseKeywordSpec, type MatchOptions } from "./keyword-match";
import { inflectedForms, morphologyKey } from "./morphology";
import type { QueryAst } from "./query-ast";
import { turkishFold } from "./turkish";

/**
 * A "word fingerprint": what is left of a story's text after its words have been hashed.
 * The text itself is never kept — only 32-bit hashes of the distinct words, 16-bit hashes
 * of neighbouring word pairs (so a phrase such as "yapay zeka" is not confused with the
 * two words appearing apart) and hashes of short ALL-CAPS abbreviations as published.
 * It cannot show or rebuild a sentence, so the 200-character storage limit still holds,
 * yet a monitoring saved later can be matched against everything the feed told us about a
 * story, not only the part we keep.
 *
 * Binary layout (little-endian): version u8 | words u16 | pairs u16 | caps u8 |
 * word hashes u32[] (sorted) | pair hashes u16[] (sorted) | cap hashes u32[] (sorted).
 *
 * Matching is word-level: whole words and phrases built from letters, digits and spaces.
 * A keyword the fingerprint cannot judge ("banka*", "#etiket", "e-ticaret") is reported as
 * "no match" here — it is still matched exactly against the stored headline and excerpt.
 */
const VERSION = 1;
export const MAX_FINGERPRINT_WORDS = 400;
const MAX_CAPS = 40;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const SUPPORTED_TERM = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;
const CAPS_PATTERN = /^[\p{Lu}\p{N}]{2,6}$/u;

/** FNV-1a over UTF-16 code units, 32 bits. */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pairHash(first: string, second: string): number {
  // Folded through a second multiplier so the 16 bits are not just the word hash's low bits.
  const h = hash32(`${first} ${second}`);
  return ((h >>> 16) ^ Math.imul(h & 0xffff, 40503)) & 0xffff;
}

function wordsOf(text: string): string[] {
  return turkishFold(text).match(WORD_PATTERN) ?? [];
}

/** Null when the text has no words at all. */
export function buildWordFingerprint(text: string): Uint8Array | null {
  const words = wordsOf(text);
  if (words.length === 0) return null;

  const wordHashes = new Set<number>();
  const pairHashes = new Set<number>();
  for (let i = 0; i < words.length && wordHashes.size < MAX_FINGERPRINT_WORDS; i++) {
    const word = words[i]!;
    wordHashes.add(hash32(word));
    const next = words[i + 1];
    if (next !== undefined) pairHashes.add(pairHash(word, next));
  }

  const capHashes = new Set<number>();
  for (const token of text.normalize("NFC").match(WORD_PATTERN) ?? []) {
    if (capHashes.size >= MAX_CAPS) break;
    if (CAPS_PATTERN.test(token) && /\p{L}/u.test(token)) capHashes.add(hash32(token));
  }

  const sortedWords = [...wordHashes].sort((a, b) => a - b);
  const sortedPairs = [...pairHashes].sort((a, b) => a - b);
  const sortedCaps = [...capHashes].sort((a, b) => a - b);

  const bytes = new Uint8Array(6 + sortedWords.length * 4 + sortedPairs.length * 2 + sortedCaps.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, VERSION);
  view.setUint16(1, sortedWords.length, true);
  view.setUint16(3, sortedPairs.length, true);
  view.setUint8(5, sortedCaps.length);
  let offset = 6;
  for (const value of sortedWords) {
    view.setUint32(offset, value, true);
    offset += 4;
  }
  for (const value of sortedPairs) {
    view.setUint16(offset, value, true);
    offset += 2;
  }
  for (const value of sortedCaps) {
    view.setUint32(offset, value, true);
    offset += 4;
  }
  return bytes;
}

type Reader = {
  hasWord(hash: number): boolean;
  hasPair(hash: number): boolean;
  hasCap(hash: number): boolean;
  /** calls back with every stored word hash */
  forEachWord(callback: (hash: number) => void): void;
};

function binarySearch(count: number, at: (index: number) => number, target: number): boolean {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = at(mid);
    if (value === target) return true;
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  return false;
}

function readerFor(fingerprint: Uint8Array): Reader | null {
  if (fingerprint.length < 6) return null;
  const view = new DataView(fingerprint.buffer, fingerprint.byteOffset, fingerprint.byteLength);
  if (view.getUint8(0) !== VERSION) return null;
  const words = view.getUint16(1, true);
  const pairs = view.getUint16(3, true);
  const caps = view.getUint8(5);
  const pairsAt = 6 + words * 4;
  const capsAt = pairsAt + pairs * 2;
  if (capsAt + caps * 4 !== fingerprint.byteLength) return null;
  return {
    hasWord: (hash) => binarySearch(words, (i) => view.getUint32(6 + i * 4, true), hash),
    hasPair: (hash) => binarySearch(pairs, (i) => view.getUint16(pairsAt + i * 2, true), hash),
    hasCap: (hash) => binarySearch(caps, (i) => view.getUint32(capsAt + i * 4, true), hash),
    forEachWord: (callback) => {
      for (let i = 0; i < words; i += 1) callback(view.getUint32(6 + i * 4, true));
    },
  };
}

/** One keyword prepared for fingerprints: what its words hash to, and every form its last word can take. */
type TermMatcher = (reader: Reader) => boolean;

function compileTerm(term: string, language: string | null | undefined): TermMatcher | null {
  const spec = parseKeywordSpec(term);
  if (spec.prefix || !SUPPORTED_TERM.test(spec.core)) return null;
  if (spec.caseSensitive) {
    const capHash = hash32(spec.core);
    return (reader) => reader.hasCap(capHash);
  }
  const words = wordsOf(spec.core);
  if (words.length === 0) return null;
  const head = words.slice(0, -1);
  const last = words[words.length - 1]!;
  const headHashes = head.map(hash32);
  const headPairs = head.slice(0, -1).map((word, i) => pairHash(word, head[i + 1]!));
  // hash of every form of the last word → the forms (a hash can in theory be shared)
  const forms = new Map<number, string[]>();
  for (const form of inflectedForms(last, language)) {
    const hash = hash32(form);
    const known = forms.get(hash);
    if (known) known.push(form);
    else forms.set(hash, [form]);
  }
  const previous = head[head.length - 1];
  return (reader) => {
    if (!headHashes.every((hash) => reader.hasWord(hash))) return false;
    if (!headPairs.every((hash) => reader.hasPair(hash))) return false;
    let found = false;
    reader.forEachWord((hash) => {
      if (found) return;
      const candidates = forms.get(hash);
      if (!candidates) return;
      if (previous === undefined || candidates.some((form) => reader.hasPair(pairHash(previous, form)))) found = true;
    });
    return found;
  };
}

type CompiledQuery = {
  excludes: (TermMatcher | null)[];
  includes: { term: string; match: TermMatcher | null }[];
};

const compiled = new WeakMap<QueryAst, Map<string, CompiledQuery>>();

function compileQuery(ast: QueryAst, language: string | null | undefined): CompiledQuery {
  const key = morphologyKey(language);
  let byLanguage = compiled.get(ast);
  if (!byLanguage) {
    byLanguage = new Map();
    compiled.set(ast, byLanguage);
  }
  let query = byLanguage.get(key);
  if (!query) {
    query = {
      excludes: ast.exclude.map((term) => compileTerm(term, language)),
      includes: [...ast.exactPhrases, ...ast.include].map((term) => ({ term, match: compileTerm(term, language) })),
    };
    byLanguage.set(key, query);
  }
  return query;
}

/**
 * The include term (exact phrases first, as findMatchedTerm does) a stored fingerprint
 * satisfies, or null. Keywords take the same word endings as in running text. A monitoring
 * with an exclusion the fingerprint cannot judge never matches this way: it could not be told
 * apart from a story the exclusion should drop.
 */
export function findFingerprintMatch(
  ast: QueryAst,
  fingerprint: Uint8Array | null | undefined,
  options: MatchOptions = {},
): string | null {
  if (!fingerprint) return null;
  const reader = readerFor(fingerprint);
  if (!reader) return null;
  const query = compileQuery(ast, options.language);

  for (const exclude of query.excludes) {
    if (exclude === null || exclude(reader)) return null;
  }
  for (const include of query.includes) {
    if (include.match?.(reader)) return include.term;
  }
  return null;
}

export function matchesFingerprint(ast: QueryAst, fingerprint: Uint8Array | null | undefined, options: MatchOptions = {}): boolean {
  return findFingerprintMatch(ast, fingerprint, options) !== null;
}
