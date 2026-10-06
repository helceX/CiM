import { describe, expect, it } from "vitest";
import { emptyQueryAst, matchesText, type QueryAst } from "./query-ast";
import { buildWordFingerprint, findFingerprintMatch, matchesFingerprint } from "./word-fingerprint";

const ast = (parts: Partial<QueryAst>): QueryAst => ({ ...emptyQueryAst(), ...parts });

const STORY =
  "Zorlu Holding yeni yatırımını duyurdu. Şirket yapay zeka alanında THY ile ortaklık kuracak; " +
  "İstanbul'daki merkezde çalışacak ekip Acme'nin bölgesel planına katkı verecek.";

describe("word fingerprint", () => {
  it("is null for text with no words and never contains the text itself", () => {
    expect(buildWordFingerprint("   ...  ")).toBeNull();
    const fp = buildWordFingerprint(STORY)!;
    expect(fp.byteLength).toBeLessThan(400);
    expect(Buffer.from(fp).toString("utf8")).not.toContain("Zorlu");
  });

  it("matches a word anywhere in the text, with Turkish folding and suffix boundaries", () => {
    const fp = buildWordFingerprint(STORY);
    expect(matchesFingerprint(ast({ include: ["acme"] }), fp)).toBe(true);
    expect(matchesFingerprint(ast({ include: ["İSTANBUL"] }), fp)).toBe(true);
    expect(matchesFingerprint(ast({ include: ["bankası"] }), fp)).toBe(false);
  });

  it("does not match a word that is only part of another word", () => {
    const fp = buildWordFingerprint("Akbank yeni şube açtı");
    expect(matchesFingerprint(ast({ include: ["ak"] }), fp)).toBe(false);
    expect(matchesFingerprint(ast({ include: ["akbank"] }), fp)).toBe(true);
  });

  it("matches phrases only when the words are next to each other", () => {
    const together = buildWordFingerprint("Yapay zeka yatırımı arttı");
    const apart = buildWordFingerprint("Yapay bir plan, zeka dolu bir sunum");
    const phrase = ast({ exactPhrases: ["yapay zeka"] });
    expect(matchesFingerprint(phrase, together)).toBe(true);
    expect(matchesFingerprint(phrase, apart)).toBe(false);
  });

  it("keeps short ALL-CAPS abbreviations case-sensitive", () => {
    expect(matchesFingerprint(ast({ include: ["THY"] }), buildWordFingerprint("THY'nin yeni uçağı"))).toBe(true);
    expect(matchesFingerprint(ast({ include: ["THY"] }), buildWordFingerprint("thy kelimesi küçük yazıldı"))).toBe(false);
    expect(matchesFingerprint(ast({ include: ["AK"] }), buildWordFingerprint("ak boya satışı arttı"))).toBe(false);
  });

  it("drops a story that contains an excluded word, and refuses to judge unsupported exclusions", () => {
    const fp = buildWordFingerprint(STORY);
    expect(matchesFingerprint(ast({ include: ["holding"], exclude: ["yoksa"] }), fp)).toBe(true);
    expect(matchesFingerprint(ast({ include: ["holding"], exclude: ["thy"] }), fp)).toBe(false);
    expect(matchesFingerprint(ast({ include: ["holding"], exclude: ["ortaklık"] }), fp)).toBe(false);
    expect(matchesFingerprint(ast({ include: ["holding"], exclude: ["banka*"] }), fp)).toBe(false);
  });

  it("leaves wildcard and punctuated keywords to the exact text match", () => {
    const fp = buildWordFingerprint("Bankalar faiz kararını bekliyor #ekonomi");
    expect(matchesFingerprint(ast({ include: ["banka*"] }), fp)).toBe(false);
    expect(matchesFingerprint(ast({ include: ["#ekonomi"] }), fp)).toBe(false);
  });

  it("returns the matching term, phrases first", () => {
    const fp = buildWordFingerprint(STORY);
    expect(findFingerprintMatch(ast({ include: ["acme"], exactPhrases: ["zorlu holding"] }), fp)).toBe("zorlu holding");
    expect(findFingerprintMatch(ast({ include: ["yok"] }), fp)).toBeNull();
    expect(findFingerprintMatch(ast({ include: ["acme"] }), null)).toBeNull();
  });

  it("rejects fingerprints it cannot read", () => {
    expect(matchesFingerprint(ast({ include: ["acme"] }), new Uint8Array([9, 0, 0]))).toBe(false);
    expect(matchesFingerprint(ast({ include: ["acme"] }), new Uint8Array([1, 5, 0, 0, 0, 0]))).toBe(false);
  });

  it("agrees with exact matching on whole-word terms of ordinary text", () => {
    const text = "Merkez Bankası faiz kararını açıkladı; piyasalarda Borsa İstanbul yükseldi.";
    const fp = buildWordFingerprint(text);
    for (const term of ["faiz", "borsa istanbul", "merkez bankası", "enflasyon", "piyasa"]) {
      const query = ast({ include: [term] });
      expect(matchesFingerprint(query, fp), term).toBe(matchesText(query, text));
    }
  });

  it("keeps at most 400 distinct words", () => {
    const many = Array.from({ length: 1000 }, (_, i) => `kelime${i}`).join(" ");
    const fp = buildWordFingerprint(many)!;
    expect(fp.byteLength).toBeLessThan(6 + 400 * 4 + 400 * 2 + 4);
    expect(matchesFingerprint(ast({ include: ["kelime0"] }), fp)).toBe(true);
    expect(matchesFingerprint(ast({ include: ["kelime999"] }), fp)).toBe(false);
  });
});
