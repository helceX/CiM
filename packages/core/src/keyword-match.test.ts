import { describe, expect, it } from "vitest";
import { describeKeywordMatch, keywordMatches, parseKeywordSpec, prepareText } from "./keyword-match";

const hit = (term: string, text: string) => keywordMatches(term, prepareText(text));

describe("whole-word matching", () => {
  it("does not match inside a longer word", () => {
    expect(hit("THY", "ARTHYMIA tedavisinde yeni dönem")).toBe(false);
    expect(hit("THY", "Bu işi MITHYA diye adlandırdı")).toBe(false);
    expect(hit("AK", "Akbank ve akşam haberleri")).toBe(false);
    expect(hit("Ak", "Akbank ve akşam haberleri")).toBe(false);
    expect(hit("kent", "Kentsel dönüşüm ve ekent")).toBe(false);
  });

  it("matches the word itself, however the sentence is punctuated", () => {
    expect(hit("THY", "THY yeni uçak aldı")).toBe(true);
    expect(hit("THY", "Haber: THY, zarar açıkladı.")).toBe(true);
    expect(hit("THY", "(THY) yolcu sayısı arttı")).toBe(true);
    expect(hit("THY", "THY")).toBe(true);
    expect(hit("Acme", "Acme-Holding satın aldı")).toBe(true);
  });

  it("keeps the Turkish suffix after an apostrophe working", () => {
    expect(hit("THY", "THY'nin yeni hattı")).toBe(true);
    expect(hit("THY", "THY’ye tepki")).toBe(true);
    expect(hit("Acme", "Acme'nin hisseleri yükseldi")).toBe(true);
  });

  it("folds Turkish case for ordinary keywords", () => {
    expect(hit("İstanbul", "ISTANBUL'da yağış")).toBe(false); // I != İ in Turkish: not the same letter
    expect(hit("istanbul", "İstanbul'da yağış")).toBe(true);
    expect(hit("ışık", "IŞIK hızı")).toBe(true);
    expect(hit("enflasyon", "ENFLASYON beklentisi")).toBe(true);
  });

  it("matches phrases as a unit with flexible whitespace, not across other words", () => {
    expect(hit("yapay zeka", "Yapay   Zeka yatırımı arttı")).toBe(true);
    expect(hit("yapay zeka", "yapay bir zeka değil")).toBe(false);
    expect(hit("yapay zeka", "yapay zekaya karşı")).toBe(false);
    expect(hit("yapay zeka", "yapay zeka'ya karşı")).toBe(true);
  });

  it("matches terms that start or end with symbols without breaking on them", () => {
    expect(hit("#acme", "Yeni kampanya #acme ile başladı")).toBe(true);
    expect(hit("@acme", "teşekkürler @acme")).toBe(true);
    expect(hit("C++", "C++ geliştirici aranıyor")).toBe(true);
    expect(hit("acme.com", "Detaylar acme.com adresinde")).toBe(true);
  });

  it("never matches an empty keyword", () => {
    expect(hit("", "anything")).toBe(false);
    expect(hit("  *  ", "anything")).toBe(false);
  });
});

describe("short ALL-CAPS abbreviations are matched case-exactly", () => {
  it("separates AK from the word ak, and BDDK from bddk", () => {
    expect(hit("AK", "AK Parti toplandı")).toBe(true);
    expect(hit("AK", "ak kağıt üzerine yazdı")).toBe(false);
    expect(hit("BDDK", "BDDK yeni karar aldı")).toBe(true);
    expect(hit("BDDK", "bddk yeni karar aldı")).toBe(false);
  });

  it("still finds an abbreviation in an all-caps headline", () => {
    expect(hit("THY", "THY'DEN YENİ HAMLE")).toBe(true);
  });

  it("is only for short all-caps keywords; anything else ignores case", () => {
    expect(parseKeywordSpec("THY").caseSensitive).toBe(true);
    expect(parseKeywordSpec("G20").caseSensitive).toBe(true);
    expect(parseKeywordSpec("Thy").caseSensitive).toBe(false);
    expect(parseKeywordSpec("ASELSAN").caseSensitive).toBe(false); // 7 letters: a name, not an abbreviation
    expect(parseKeywordSpec("2019").caseSensitive).toBe(false);
    expect(parseKeywordSpec("A").caseSensitive).toBe(false);
    expect(hit("Thy", "thy bilet")).toBe(true);
    expect(hit("ASELSAN", "aselsan ihracatı")).toBe(true);
  });
});

describe("trailing * opens the end of the word", () => {
  it("matches suffixed forms, still not the middle of a word", () => {
    expect(hit("banka*", "Bankalar zarar etti")).toBe(true);
    expect(hit("banka*", "Bankası yeni şube açtı")).toBe(true);
    expect(hit("banka*", "banka")).toBe(true);
    expect(hit("banka*", "Kanka ve Dubanka")).toBe(false);
    expect(hit("banka", "Bankalar zarar etti")).toBe(false);
  });

  it("can combine with an abbreviation", () => {
    expect(parseKeywordSpec("AK*")).toEqual({ core: "AK", prefix: true, caseSensitive: true });
    expect(hit("AK*", "AKP ve AK Parti")).toBe(true);
    expect(hit("AK*", "akşam")).toBe(false);
  });
});

describe("describeKeywordMatch", () => {
  it("explains the rule in plain words", () => {
    expect(describeKeywordMatch("THY")).toMatch(/whole word/);
    expect(describeKeywordMatch("THY")).toMatch(/capitals/);
    expect(describeKeywordMatch("banka*")).toMatch(/start with/);
    expect(describeKeywordMatch("")).toBeNull();
  });
});
