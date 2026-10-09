/**
 * docs/architecture/SEARCH.md — Turkish-aware normalization. Naive
 * `.toLowerCase()` corrupts Turkish casing (`"İstanbul".toLowerCase()`
 * yields "i̇stanbul" with a combining dot, and `"I".toLowerCase()` yields
 * "i" instead of the correct dotless "ı"), which silently breaks
 * matching/search for Turkish content. This module owns the correct
 * mapping so it's applied consistently everywhere text is compared.
 */

const TURKISH_LOWER_MAP: Record<string, string> = {
  İ: "i",
  I: "ı",
};

/**
 * `toLocaleLowerCase("tr-TR")` builds an ICU locale object on every call, which made folding one 350-character
 * story take about a millisecond — most of the worker's CPU when a few hundred monitorings are matched. The
 * lower-case form of a character never changes, so each distinct character is asked once and remembered
 * (the answer is the same one the per-call version gave, character for character).
 */
const lowered = new Map<string, string>(Object.entries(TURKISH_LOWER_MAP));
const LOWERED_MAX = 50_000;

/** NFC-normalize, then apply Turkish-correct case folding. */
export function turkishFold(input: string): string {
  const nfc = input.normalize("NFC");
  let result = "";
  for (const char of nfc) {
    let lower = lowered.get(char);
    if (lower === undefined) {
      lower = char.toLocaleLowerCase("tr-TR");
      if (lowered.size < LOWERED_MAX) lowered.set(char, lower);
    }
    result += lower;
  }
  return result;
}
