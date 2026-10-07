import { describe, expect, it } from "vitest";
import { assembleQueryAst } from "./monitoring-input";

describe("assembleQueryAst", () => {
  it("passes a plain list through unchanged", () => {
    expect(assembleQueryAst({ include: ["startup"], exclude: ["spor"], exactPhrases: ["yapay zeka"] })).toEqual({
      include: ["startup"],
      exclude: ["spor"],
      exactPhrases: ["yapay zeka"],
    });
  });

  it("searches the company's full and short names and reads them as one thing", () => {
    const ast = assembleQueryAst({
      include: [],
      exclude: [],
      exactPhrases: [],
      company: { name: "İstanbul Ticaret Odası", short: "İTO" },
    });
    expect(ast.include).toEqual(["İstanbul Ticaret Odası", "İTO"]);
    expect(ast.aliasGroups).toEqual([["İstanbul Ticaret Odası", "İTO"]]);
    expect(ast.company).toEqual({ name: "İstanbul Ticaret Odası", short: "İTO" });
  });

  it("does not list a name twice, and keeps the person's own grouping", () => {
    const ast = assembleQueryAst({
      include: ["ito"],
      exclude: [],
      exactPhrases: [],
      aliasGroups: [["İTO", "Istanbul Chamber of Commerce"]],
      company: { name: "İstanbul Ticaret Odası", short: "İTO" },
    });
    // "İTO" and "ito" are the same name, so it is listed once, as the person typed it
    expect(ast.include).toEqual(["ito", "Istanbul Chamber of Commerce", "İstanbul Ticaret Odası"]);
    expect(ast.aliasGroups).toEqual([["İTO", "Istanbul Chamber of Commerce"]]);
  });

  it("works for a company with only a full name", () => {
    const ast = assembleQueryAst({ include: [], exclude: [], exactPhrases: [], company: { name: "Zorlu Holding" } });
    expect(ast.include).toEqual(["Zorlu Holding"]);
    expect(ast.aliasGroups).toBeUndefined();
    expect(ast.company).toEqual({ name: "Zorlu Holding" });
  });

  it("adds alias names that are not keywords yet", () => {
    const ast = assembleQueryAst({ include: ["BTM"], exclude: [], exactPhrases: [], aliasGroups: [["BTM", "Bilgiyi Ticarileştirme Merkezi"]] });
    expect(ast.include).toEqual(["BTM", "Bilgiyi Ticarileştirme Merkezi"]);
  });
});
