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

/** NFC-normalize, then apply Turkish-correct case folding. */
export function turkishFold(input: string): string {
  const nfc = input.normalize("NFC");
  let result = "";
  for (const char of nfc) {
    result += TURKISH_LOWER_MAP[char] ?? char.toLocaleLowerCase("tr-TR");
  }
  return result;
}
