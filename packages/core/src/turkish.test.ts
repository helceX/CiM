import { describe, expect, it } from "vitest";
import { turkishFold } from "./turkish";

describe("turkishFold", () => {
  it("folds dotted İ to dotted lowercase i", () => {
    expect(turkishFold("İstanbul")).toBe("istanbul");
  });

  it("folds dotless I to dotless lowercase ı", () => {
    expect(turkishFold("ISPARTA")).toBe("ısparta");
  });

  it("leaves already-lowercase Turkish characters unchanged", () => {
    expect(turkishFold("çığöşü")).toBe("çığöşü");
  });

  it("differs from naive toLowerCase for the dotless I case", () => {
    expect(turkishFold("I")).not.toBe("I".toLowerCase());
  });
});

/** The straightforward version this module started with, kept as the reference the fast one must equal. */
function referenceFold(input: string): string {
  let result = "";
  for (const char of input.normalize("NFC")) {
    result += char === "İ" ? "i" : char === "I" ? "ı" : char.toLocaleLowerCase("tr-TR");
  }
  return result;
}

describe("turkishFold is the same function as before, only faster", () => {
  it("gives the reference answer for every character of the basic planes we meet", () => {
    for (let code = 0; code < 0x3000; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue; // lone surrogates are not characters
      const char = String.fromCodePoint(code);
      expect(turkishFold(char), `U+${code.toString(16)}`).toBe(referenceFold(char));
    }
  });

  it("gives the reference answer for mixed text, repeats and astral characters", () => {
    const samples = [
      "İSTANBUL'da IŞIK hızı ve ÇAĞRI merkezi",
      "ΣΊΣΥΦΟΣ ǅ ß ﬁ ǈ Ⅷ Ⓐ",
      "😀 Ünlü ÖĞRENCİ ıı II iİ",
      "I\u0307 (I + combining dot) and İ",
      "",
    ];
    for (const sample of samples) {
      expect(turkishFold(sample)).toBe(referenceFold(sample));
      expect(turkishFold(sample)).toBe(referenceFold(sample)); // second time: from the memo
    }
  });

  it("folds a long story in a small fraction of a millisecond per hundred characters once warm", () => {
    const text = "Türkiye'nin İstanbul ve Ankara'daki ÖNEMLİ girişimleri ".repeat(8);
    turkishFold(text);
    const start = performance.now();
    for (let i = 0; i < 200; i += 1) turkishFold(text);
    const perFold = (performance.now() - start) / 200;
    expect(perFold).toBeLessThan(0.2); // the per-call ICU version took ~1 ms for this length
  });
});
