import { describe, expect, it } from "vitest";
import { explainOpportunityMatch } from "./opportunity-match";

describe("explainOpportunityMatch", () => {
  it("matches a curated English selection against Turkish evidence and counts the concept once", () => {
    const result = explainOpportunityMatch({
      themes: ["Artificial intelligence", "Grant"],
      title: "Yapay zekâ ve AI projelerine yeni hibe çağrısı",
      language: "tr",
    });
    expect(result.matchedThemes).toEqual(["Artificial intelligence", "Grant"]);
    expect(result.score).toBe(100);
    expect(result.verification.checkOpenStatus).toBe(true);
  });

  it("matches a Turkish profile term against English evidence while keeping custom terms exact", () => {
    const result = explainOpportunityMatch({
      themes: ["Sürdürülebilirlik", "custom cooperative"],
      title: "Sustainability grant for cooperatives",
      language: "en",
    });
    expect(result.matchedThemes).toEqual(["Sürdürülebilirlik"]);
    expect(result.score).toBe(50);
  });
  it("explains Turkish profile overlap and leaves eligibility unverified", () => {
    const result = explainOpportunityMatch({
      themes: ["yapay zeka", "yeşil dönüşüm"],
      title: "KOBİ'lere yapay zeka desteği açıldı",
      language: "tr",
      organizationType: "company",
      regions: ["TR"],
      constraints: ["KOBİ olmak"],
    });
    expect(result.matchedThemes).toEqual(["yapay zeka"]);
    expect(result.score).toBe(50);
    expect(result.requiresVerification).toContain(
      "Confirm the opportunity is still open with its publisher.",
    );
    expect(result.requiresVerification).toContain("Verify constraint: KOBİ olmak.");
  });

  it("does not treat a substring as a theme match", () => {
    const result = explainOpportunityMatch({
      themes: ["fon"],
      title: "Telefon üretim hattı yenilendi",
    });
    expect(result.matchedThemes).toEqual([]);
    expect(result.score).toBe(0);
  });
});
