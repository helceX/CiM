import { describe, expect, it } from "vitest";
import { explainOpportunityMatch } from "./opportunity-match";

describe("explainOpportunityMatch", () => {
  it("explains Turkish profile overlap and leaves eligibility unverified", () => {
    const result = explainOpportunityMatch({
      themes: ["yapay zeka", "ye�il d�n���m"],
      title: "KOB�'lere yapay zeka deste�i a��ld�",
      language: "tr",
      organizationType: "company",
      regions: ["TR"],
      constraints: ["KOB� olmak"],
    });
    expect(result.matchedThemes).toEqual(["yapay zeka"]);
    expect(result.score).toBe(50);
    expect(result.requiresVerification).toContain(
      "Confirm the opportunity is still open with its publisher.",
    );
    expect(result.requiresVerification).toContain("Verify constraint: KOB� olmak.");
  });

  it("does not treat a substring as a theme match", () => {
    const result = explainOpportunityMatch({
      themes: ["fon"],
      title: "Telefon �retim hatt� yenilendi",
    });
    expect(result.matchedThemes).toEqual([]);
    expect(result.score).toBe(0);
  });
});

