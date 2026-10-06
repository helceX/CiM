import { describe, expect, it } from "vitest";
import {
  astToBooleanQuery,
  classifyMatchType,
  computeMatchPriority,
  findMatchedTerm,
  matchesText,
  parseBooleanQuery,
  queryQualityWarning,
} from "./query-ast";

describe("query AST", () => {
  it("round-trips a simple include/exclude AST to Boolean syntax and back", () => {
    const ast = {
      include: ["BTM", "Startup"],
      exclude: ["job posting"],
      exactPhrases: ["Bilgiyi Ticarileştirme Merkezi"],
    };
    const boolean = astToBooleanQuery(ast);
    expect(boolean).toContain('"Bilgiyi Ticarileştirme Merkezi"');
    expect(boolean).toContain("NOT");

    const parsed = parseBooleanQuery(boolean);
    expect(parsed.exactPhrases).toContain("Bilgiyi Ticarileştirme Merkezi");
    expect(parsed.exclude).toContain("job posting");
  });

  it("round-trips a phrase containing a literal double-quote without corrupting the AST", () => {
    const ast = {
      include: [],
      exclude: [],
      exactPhrases: ['Say "no" to spam'],
    };
    const boolean = astToBooleanQuery(ast);
    const parsed = parseBooleanQuery(boolean);
    expect(parsed).toEqual(ast);
  });

  it("round-trips a multi-word exclude term containing a literal double-quote and backslash", () => {
    const ast = {
      include: [],
      exclude: ['C:\\Users\\"quoted"\\path spam'],
      exactPhrases: [],
    };
    const boolean = astToBooleanQuery(ast);
    const parsed = parseBooleanQuery(boolean);
    expect(parsed).toEqual(ast);
  });

  it("does not let a leading-quote include term swallow a later term while parsing", () => {
    const ast = {
      include: ['"leading-quote term', "Startup"],
      exclude: [],
      exactPhrases: ["a real exact phrase"],
    };
    const boolean = astToBooleanQuery(ast);
    const parsed = parseBooleanQuery(boolean);
    // The leading-quote term is forced into exactPhrases on reparse (the
    // one case quoteIfNeeded must force-quote), but it must not consume
    // any other term's text along the way.
    expect(parsed.include).toContain("Startup");
    expect(parsed.exactPhrases).toContain("a real exact phrase");
  });

  it("matches include terms case-insensitively with Turkish folding", () => {
    const ast = { include: ["İstanbul"], exclude: [], exactPhrases: [] };
    expect(matchesText(ast, "the news mentions istanbul today")).toBe(true);
  });

  it("excludes text containing an excluded term even if it also matches include", () => {
    const ast = { include: ["BTM"], exclude: ["staj"], exactPhrases: [] };
    expect(matchesText(ast, "BTM staj ilanı yayınlandı")).toBe(false);
    expect(matchesText(ast, "BTM yatırım haberi")).toBe(true);
  });

  it("matches everything when there are no include terms (exclude-only query)", () => {
    const ast = { include: [], exclude: ["spam"], exactPhrases: [] };
    expect(matchesText(ast, "regular article text")).toBe(true);
    expect(matchesText(ast, "this is spam content")).toBe(false);
  });

  it("flags a short single ambiguous term as needing disambiguation", () => {
    const ast = { include: ["Apple"], exclude: [], exactPhrases: [] };
    expect(queryQualityWarning(ast)).not.toBeNull();
  });

  it("does not flag a multi-term or phrase query", () => {
    const ast = { include: ["Apple", "Inc"], exclude: [], exactPhrases: [] };
    expect(queryQualityWarning(ast)).toBeNull();
  });

  describe("computeMatchPriority", () => {
    it("is 'high' when an exact phrase matches (a stronger signal than a loose keyword)", () => {
      const ast = { include: [], exclude: [], exactPhrases: ["Northwind Atlas"] };
      expect(computeMatchPriority(ast, "Northwind Atlas wins regional award")).toBe(
        "high",
      );
    });

    it("is 'normal' when only a loose include term matches, even with exact phrases configured", () => {
      const ast = {
        include: ["Northwind"],
        exclude: [],
        exactPhrases: ["Northwind Atlas"],
      };
      expect(computeMatchPriority(ast, "Northwind expands into a new region")).toBe(
        "normal",
      );
    });

    it("is 'normal' when there are no exact phrases configured at all", () => {
      const ast = { include: ["Northwind"], exclude: [], exactPhrases: [] };
      expect(computeMatchPriority(ast, "Northwind announces quarterly results")).toBe(
        "normal",
      );
    });
  });

  describe("findMatchedTerm", () => {
    it("prefers an exact phrase over a looser include term when both match", () => {
      const ast = {
        include: ["Northwind"],
        exclude: [],
        exactPhrases: ["Northwind Atlas"],
      };
      expect(findMatchedTerm(ast, "Northwind Atlas wins regional award")).toBe(
        "Northwind Atlas",
      );
    });

    it("falls back to the matching include term when no exact phrase matches", () => {
      const ast = {
        include: ["Northwind"],
        exclude: [],
        exactPhrases: ["Northwind Atlas"],
      };
      expect(findMatchedTerm(ast, "Northwind expands into a new region")).toBe(
        "Northwind",
      );
    });

    it("returns null when the query has no include/exactPhrase terms at all", () => {
      const ast = { include: [], exclude: ["spam"], exactPhrases: [] };
      expect(findMatchedTerm(ast, "regular article text")).toBeNull();
    });
  });

  describe("classifyMatchType", () => {
    it("classifies an @handle on a social source as direct_mention", () => {
      const ast = { include: ["@brand"], exclude: [], exactPhrases: [] };
      expect(classifyMatchType(ast, "@brand", "social")).toEqual({
        matchType: "direct_mention",
        matchedRule: 'Matched direct mention: "@brand"',
      });
    });

    it("does not classify an @handle as direct_mention on a non-social source", () => {
      const ast = { include: ["@brand"], exclude: [], exactPhrases: [] };
      expect(classifyMatchType(ast, "@brand", "news").matchType).toBe("contextual");
    });

    it("classifies a #hashtag as hashtag regardless of source type", () => {
      const ast = { include: ["#Brand"], exclude: [], exactPhrases: [] };
      expect(classifyMatchType(ast, "#Brand", "news")).toEqual({
        matchType: "hashtag",
        matchedRule: 'Matched hashtag: "#Brand"',
      });
    });

    it("classifies a bare domain as url", () => {
      const ast = { include: ["brand.com"], exclude: [], exactPhrases: [] };
      expect(classifyMatchType(ast, "brand.com", "web").matchType).toBe("url");
    });

    it("classifies a matched exact phrase as exact_name", () => {
      const ast = { include: [], exclude: [], exactPhrases: ["Brand Company"] };
      expect(classifyMatchType(ast, "Brand Company", "news").matchType).toBe(
        "exact_name",
      );
    });

    it("classifies a loose include-term match as contextual", () => {
      const ast = { include: ["Brand"], exclude: [], exactPhrases: [] };
      expect(classifyMatchType(ast, "Brand", "news").matchType).toBe("contextual");
    });
  });
});

describe("matchableText", () => {
  it("joins the headline and the lead so a brand named only in the lead still matches", async () => {
    const { matchableText, matchesText } = await import("./query-ast");
    const ast = { include: ["Zorlu Holding"], exclude: [], exactPhrases: [] };
    expect(matchesText(ast, "Enerji piyasasında hareket")).toBe(false);
    expect(matchesText(ast, matchableText({ title: "Enerji piyasasında hareket", lead: "Zorlu Holding açıklama yaptı." }))).toBe(true);
    expect(matchableText({ title: "Sadece başlık", lead: "  " })).toBe("Sadece başlık");
  });
});
