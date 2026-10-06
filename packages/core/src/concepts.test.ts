import { describe, expect, it } from "vitest";
import { conceptKey, conceptOfTerm, initialsOf, normalizeAliasGroups, suggestAliasGroups } from "./concepts";

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
