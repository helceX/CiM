import { describe, expect, it } from "vitest";
import { signalFor } from "./signals";

describe("social relevance without invented news coverage", () => {
  it("does not boost social posts for multiple search sources, while news coverage still contributes", () => {
    const query = { queryAst: { include: ["Lunavera"], exclude: [], exactPhrases: [], company: { name: "Lunavera" } }, trackingTarget: "company" };
    const story = { title: "Lunavera launched a product", lead: null, language: "en", sourceType: "social" };
    expect(signalFor(query, story, 10)).toEqual(signalFor(query, story, 1));
    expect(signalFor(query, { ...story, sourceType: "news" }, 10).score).toBeGreaterThan(signalFor(query, { ...story, sourceType: "news" }, 1).score);
  });
});
