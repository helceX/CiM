import { describe, expect, it } from "vitest";
import { inflectedForms, morphologyPacksFor } from "./morphology";
import { keywordMatches, prepareText } from "./keyword-match";
import { emptyQueryAst, matchesText } from "./query-ast";
import { buildWordFingerprint, matchesFingerprint } from "./word-fingerprint";

const hit = (term: string, text: string, language?: string | null) => keywordMatches(term, prepareText(text), { language });

describe("Turkish word endings", () => {
  it("finds a keyword in its plural, possessive, case and derived forms", () => {
    for (const form of ["girişimci", "girişimciler", "girişimcinin", "girişimciye", "girişimciyi", "girişimcilerin", "girişimcilere", "girişimcisi", "girişimcileri", "girişimcilik", "girişimcilikte", "girişimcimiz", "girişimcilerden"]) {
      expect(hit("girişimci", `Genç ${form} desteklenecek`, "tr"), form).toBe(true);
    }
  });

  it("does not stretch a keyword into unrelated words", () => {
    expect(hit("girişimci", "girişim sayısı arttı", "tr")).toBe(false);
    expect(hit("banka", "bankacılık sektörü", "tr")).toBe(false);
    expect(hit("kent", "kentsel dönüşüm", "tr")).toBe(false);
    expect(hit("ak", "akıl hocası", "tr")).toBe(false); // short words only match themselves
  });

  it("follows the last consonant that softens before a vowel ending", () => {
    expect(hit("kitap", "Kitabı okudum", "tr")).toBe(true);
    expect(hit("çocuk", "Çocuğu okula bıraktı", "tr")).toBe(true);
    expect(hit("ağaç", "Ağacın gölgesi", "tr")).toBe(true);
    expect(hit("renk", "Rengi çok canlı", "tr")).toBe(true);
    expect(hit("kitap", "Kitabın", "tr")).toBe(true);
  });

  it("puts the endings on the last word of a phrase only", () => {
    expect(hit("bilgiyi ticarileştirme merkezi", "Bilgiyi Ticarileştirme Merkezinin yeni projesi", "tr")).toBe(true);
    expect(hit("bilgiyi ticarileştirme merkezi", "Bilgiyi Ticarileştirme Merkezine ziyaret", "tr")).toBe(true);
    expect(hit("istanbul ticaret odası", "İstanbul Ticaret Odasında toplantı", "tr")).toBe(true);
    expect(hit("istanbul ticaret odası", "İstanbul Ticaret Odası'nın raporu", "tr")).toBe(true);
    expect(hit("istanbul ticaret odası", "İstanbul'un ticaret odası", "tr")).toBe(false);
  });

  it("keeps abbreviations exact but accepts the apostrophe ending", () => {
    expect(hit("BTM", "BTM'nin yeni programı", "tr")).toBe(true);
    expect(hit("BTM", "BTM’ye başvuru", "tr")).toBe(true);
    expect(hit("BTM", "BTMler", "tr")).toBe(false);
    expect(hit("İTO", "İTO’nun açıklaması", "tr")).toBe(true);
  });
});

describe("English word endings", () => {
  it("finds plural, possessive and verb forms", () => {
    for (const form of ["startup", "startups", "startup's", "startups'", "startup’s"]) {
      expect(hit("startup", `Many ${form} raised money`, "en"), form).toBe(true);
    }
    expect(hit("company", "Three companies merged", "en")).toBe(true);
    expect(hit("create", "It is creating jobs; they created more", "en")).toBe(true);
    expect(hit("invest", "She invested, investing and investor", "en")).toBe(true);
    expect(hit("run", "running", "en")).toBe(false); // too short to take endings
    expect(hit("planning", "planning", "en")).toBe(true);
    expect(hit("plan", "They are planning ahead; he planned", "en")).toBe(true);
  });

  it("does not match a different word that merely starts the same", () => {
    expect(hit("invest", "investigate", "en")).toBe(false);
    expect(hit("market", "marketplace", "en")).toBe(false);
  });
});

describe("language selection", () => {
  it("uses Turkish and English when the language is unknown, one pack when it is known", () => {
    expect(morphologyPacksFor(null).map((p) => p.id)).toEqual(["tr", "en"]);
    expect(morphologyPacksFor("tr-TR").map((p) => p.id)).toEqual(["tr"]);
    expect(morphologyPacksFor("EN").map((p) => p.id)).toEqual(["en"]);
    expect(morphologyPacksFor("de").map((p) => p.id)).toEqual(["de"]);
    expect(morphologyPacksFor("ru")).toEqual([]);
  });

  it("applies only the pack of the text's language", () => {
    expect(hit("startup", "Startuplar büyüyor", "en")).toBe(false);
    expect(hit("startup", "Startuplar büyüyor", "tr")).toBe(true);
    expect(hit("startup", "Startups are growing", "tr")).toBe(false);
    expect(hit("startup", "Startups are growing", null)).toBe(true);
    expect(hit("startup", "Startuplar büyüyor", null)).toBe(true);
    expect(hit("startup", "Startups are growing", "ru")).toBe(false);
    expect(hit("Unternehmen", "Die Unternehmen wachsen", "de")).toBe(true);
    expect(hit("empresa", "Las empresas crecen", "es")).toBe(true);
  });
});

describe("punctuation inside and around keywords", () => {
  it("treats apostrophes, hyphens, dots and spaces between a keyword's words alike", () => {
    expect(hit("o'reilly", "O’Reilly yayınları", "en")).toBe(true);
    expect(hit("o'reilly", "O Reilly yayınları", "en")).toBe(true);
    expect(hit("ar-ge", "Ar-Ge merkezi açıldı", "tr")).toBe(true);
    expect(hit("ar-ge", "Ar Ge merkezi açıldı", "tr")).toBe(true);
    expect(hit("ar ge", "Ar-Ge merkezi açıldı", "tr")).toBe(false); // a space asks for a space
  });

  it("still anchors on words and keeps symbols that start or end a keyword", () => {
    expect(hit("#startup", "Yeni #startup haberi", null)).toBe(true);
    expect(hit("C++", "C++ aranıyor", null)).toBe(true);
    expect(hit("acme.com", "bkz acme.com adresi", null)).toBe(true);
    expect(hit("ar-ge", "bar-gelin", "tr")).toBe(false);
  });
});

describe("forms and the word fingerprint agree with the text matcher", () => {
  it("lists the bare word first and every ending", () => {
    const forms = inflectedForms("girişimci", "tr");
    expect(forms[0]).toBe("girişimci");
    expect(forms).toEqual(expect.arrayContaining(["girişimcilerin", "girişimciye", "girişimcilik"]));
    expect(inflectedForms("kitap", "tr")).toEqual(expect.arrayContaining(["kitabı", "kitaplar"]));
    expect(inflectedForms("kitap", "tr")).not.toContain("kitab");
    expect(inflectedForms("run", "en")).toEqual(["run"]);
  });

  it("matches a stored story by an inflected form of its words", () => {
    const fp = buildWordFingerprint("Genç girişimcilerin yeni yatırımı ve Bilgiyi Ticarileştirme Merkezinin programı");
    const ast = (include: string[], exactPhrases: string[] = []) => ({ ...emptyQueryAst(), include, exactPhrases });
    expect(matchesFingerprint(ast(["girişimci"]), fp, { language: "tr" })).toBe(true);
    expect(matchesFingerprint(ast([], ["bilgiyi ticarileştirme merkezi"]), fp, { language: "tr" })).toBe(true);
    expect(matchesFingerprint(ast(["gelişim"]), fp, { language: "tr" })).toBe(false);
    expect(matchesFingerprint(ast(["girişimci"]), fp, { language: "en" })).toBe(false);
    const text = "Genç girişimcilerin yeni yatırımı";
    expect(matchesText(ast(["girişimci"]), text, { language: "tr" })).toBe(matchesFingerprint(ast(["girişimci"]), buildWordFingerprint(text), { language: "tr" }));
  });
});
