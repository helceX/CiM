import { parseKeywordSpec } from "./keyword-match";
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
  };
}

function termInFingerprint(term: string, reader: Reader): boolean | null {
  const spec = parseKeywordSpec(term);
  if (spec.prefix || !SUPPORTED_TERM.test(spec.core)) return null;
  if (spec.caseSensitive) return reader.hasCap(hash32(spec.core));
  const words = wordsOf(spec.core);
  if (words.length === 0) return null;
  if (!words.every((word) => reader.hasWord(hash32(word)))) return false;
  for (let i = 0; i + 1 < words.length; i++) {
    if (!reader.hasPair(pairHash(words[i]!, words[i + 1]!))) return false;
  }
  return true;
}

/**
 * The include term (exact phrases first, as findMatchedTerm does) a stored fingerprint
 * satisfies, or null. A monitoring with an exclusion the fingerprint cannot judge never
 * matches this way: it could not be told apart from a story the exclusion should drop.
 */
export function findFingerprintMatch(ast: QueryAst, fingerprint: Uint8Array | null | undefined): string | null {
  if (!fingerprint) return null;
  const reader = readerFor(fingerprint);
  if (!reader) return null;

  for (const term of ast.exclude) {
    const found = termInFingerprint(term, reader);
    if (found === null || found) return null;
  }
  for (const term of [...ast.exactPhrases, ...ast.include]) {
    if (termInFingerprint(term, reader) === true) return term;
  }
  return null;
}

export function matchesFingerprint(ast: QueryAst, fingerprint: Uint8Array | null | undefined): boolean {
  return findFingerprintMatch(ast, fingerprint) !== null;
}
