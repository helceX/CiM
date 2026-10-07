import { describe, expect, it } from "vitest";
import { autoKeywordClusters, conceptKey, conceptOfTerm, effectiveAliasGroups, initialsOf, monitoringFamilyName, normalizeAliasGroups, suggestAliasGroups } from "./concepts";

describe("alias groups", () => {
  it("compares names without case, punctuation or a trailing star", () => {
    expect(conceptKey("İTO")).toBe(conceptKey("ito"));
    expect(conceptKey("Ar-Ge*")).toBe(conceptKey("ar ge"));
  });

  it("keeps only groups of two or more different names, each name in one group", () => {
    expect(normalizeAliasGroups([["BTM", " btm ", "Bilgiyi Ticarileştirme Merkezi"], ["alone"], ["İTO", "BTM"]])).toEqual([
      ["BTM", "Bilgiyi Ticarileştirme Merkezi"],
    ]);
    expect(normalizeAliasGroups(null)).toEqual([]);
    expect(normalizeAliasGroups([["a", "b"], ["b", "c"]])).toEqual([["a", "b"]]);
  });

  it("finds the concept of a matched term; an ungrouped term is its own concept", () => {
    const groups = [["İTO", "İstanbul Ticaret Odası"]];
    expect(conceptOfTerm(groups, "istanbul ticaret odası")).toEqual({ label: "İTO", variants: ["İTO", "İstanbul Ticaret Odası"] });
    expect(conceptOfTerm(groups, "BTM")).toEqual({ label: "BTM", variants: ["BTM"] });
    expect(conceptOfTerm(undefined, "BTM").label).toBe("BTM");
  });
});

describe("abbreviation suggestions", () => {
  it("reads initials, skipping little connecting words", () => {
    expect(initialsOf("İstanbul Ticaret Odası")).toBe("ito");
    expect(initialsOf("Bilgiyi Ticarileştirme Merkezi")).toBe("btm");
    expect(initialsOf("Banking and Finance Authority")).toBe("bfa");
    expect(initialsOf("Mediaory")).toBe("");
  });

  it("suggests an abbreviation and the name it abbreviates", () => {
    const terms = ["BTM", "Bilgiyi Ticarileştirme Merkezi", "İTO", "İstanbul Ticaret Odası", "girişimci"];
    expect(suggestAliasGroups(terms)).toEqual([
      ["BTM", "Bilgiyi Ticarileştirme Merkezi"],
      ["İTO", "İstanbul Ticaret Odası"],
    ]);
  });

  it("does not suggest what is already grouped or what does not fit", () => {
    const terms = ["BTM", "Bilgiyi Ticarileştirme Merkezi", "XYZ"];
    expect(suggestAliasGroups(terms, [["BTM", "Bilgiyi Ticarileştirme Merkezi"]])).toEqual([]);
    expect(suggestAliasGroups(["XYZ", "Bilgiyi Ticarileştirme Merkezi"])).toEqual([]);
  });
});

describe("autoKeywordClusters", () => {
  it("groups forms of one word without being asked", () => {
    const groups = autoKeywordClusters(["girişimci", "girişimcilik", "girişimcinin", "yatırım", "yatırımcı", "yatırımcılık", "teknoloji"]);
    expect(groups).toHaveLength(2);
    const girisim = groups.find((g) => g.includes("girişimci"))!;
    expect(new Set(girisim)).toEqual(new Set(["girişimci", "girişimcilik", "girişimcinin"]));
    expect(girisim[0]).toBe("girişimci"); // the shortest leads
    const yatirim = groups.find((g) => g.includes("yatırım"))!;
    expect(new Set(yatirim)).toEqual(new Set(["yatırım", "yatırımcı", "yatırımcılık"]));
    expect(yatirim[0]).toBe("yatırım");
  });

  it("leaves unrelated words, abbreviations and starred keywords alone", () => {
    expect(autoKeywordClusters(["banka", "bankacı", "borsa", "THY", "THYAO"])).toEqual([["banka", "bankacı"]]);
    expect(autoKeywordClusters(["yatırım*", "yatırımcı"])).toEqual([]);
    expect(autoKeywordClusters(["ev", "evet", "gel"])).toEqual([]);
  });

  it("works for English plurals too", () => {
    expect(autoKeywordClusters(["startup", "startups"])).toEqual([["startup", "startups"]]);
  });
});

describe("effectiveAliasGroups", () => {
  it("merges the customer's groups with automatic ones that share a name", () => {
    const groups = effectiveAliasGroups([["BTM", "Bilgiyi Ticarileştirme Merkezi"]], ["BTM", "Bilgiyi Ticarileştirme Merkezi", "yatırım", "yatırımcı"]);
    expect(groups).toEqual([["BTM", "Bilgiyi Ticarileştirme Merkezi"], ["yatırım", "yatırımcı"]]);
  });

  it("keeps the customer's first name as the label when an automatic group joins theirs", () => {
    const groups = effectiveAliasGroups([["Girişimcilik", "Entrepreneurship"]], ["Girişimcilik", "Entrepreneurship", "girişimci", "girişimcinin"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]![0]).toBe("Girişimcilik");
    expect(new Set(groups[0])).toEqual(new Set(["Girişimcilik", "Entrepreneurship", "girişimci", "girişimcinin"]));
  });

  it("returns nothing when nothing is related", () => {
    expect(effectiveAliasGroups([], ["kahve", "çay"])).toEqual([]);
    expect(effectiveAliasGroups(undefined, [])).toEqual([]);
  });
});

describe("monitoringFamilyName", () => {
  it("drops a trailing version so v1, v2 and v3 belong together", () => {
    for (const name of ["BTM Monitoring v1", "BTM Monitoring v2", "BTM Monitoring V3", "BTM Monitoring (4)", "BTM Monitoring - 5", "BTM Monitoring 6", "BTM Monitoring version 7"]) {
      expect(monitoringFamilyName(name)).toBe("BTM Monitoring");
    }
  });

  it("leaves other names whole", () => {
    expect(monitoringFamilyName("Zorlu Holding")).toBe("Zorlu Holding");
    expect(monitoringFamilyName("G20")).toBe("G20");
    expect(monitoringFamilyName("v2")).toBe("v2");
    expect(monitoringFamilyName("  İTO   izleme ")).toBe("İTO izleme");
  });
});
