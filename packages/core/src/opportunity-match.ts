import { keywordMatches, prepareText } from "./keyword-match";

export type OpportunityMatch = {
  score: number;
  matchedThemes: string[];
  reasons: string[];
  requiresVerification: string[];
  verification: {
    checkOpenStatus: boolean;
    checkPublisherTerms: boolean;
    organizationType?: string;
    regions: string[];
    constraints: string[];
  };
};

/** Deterministic profile overlap only; never asserts that a program is eligible or currently open. */
export function explainOpportunityMatch(input: {
  themes: readonly string[];
  title: string;
  excerpt?: string | null;
  language?: string | null;
  organizationType?: string;
  regions?: readonly string[];
  constraints?: readonly string[];
}): OpportunityMatch {
  const title = prepareText(input.title);
  const excerpt = prepareText(input.excerpt ?? "");
  const options = { language: input.language };
  const matchedThemes = [
    ...new Set(input.themes.map((theme) => theme.trim()).filter(Boolean)),
  ].filter(
    (theme) =>
      keywordMatches(theme, title, options) || keywordMatches(theme, excerpt, options),
  );
  const denominator = Math.max(
    1,
    new Set(
      input.themes
        .map((theme) => theme.trim().toLocaleLowerCase("tr-TR"))
        .filter(Boolean),
    ).size,
  );
  const reasons = matchedThemes.map(
    (theme) => `The source text mentions the profile theme "${theme}".`,
  );
  if (reasons.length === 0)
    reasons.push("No profile theme was found in the stored headline or excerpt.");

  const checks = [
    "Confirm the opportunity is still open with its publisher.",
    "Confirm the publisher's eligibility rules, amount, and deadline; these are not inferred from a theme match.",
  ];
  if (input.organizationType)
    checks.push(
      `Confirm eligibility for organization type: ${input.organizationType}.`,
    );
  if (input.regions?.length)
    checks.push(
      `Confirm the eligible geography includes: ${input.regions.join(", ")}.`,
    );
  if (input.constraints?.length)
    checks.push(...input.constraints.map((item) => `Verify constraint: ${item}.`));

  return {
    score: Math.round((matchedThemes.length / denominator) * 100),
    matchedThemes,
    reasons,
    requiresVerification: checks,
    verification: {
      checkOpenStatus: true,
      checkPublisherTerms: true,
      ...(input.organizationType ? { organizationType: input.organizationType } : {}),
      regions: [...(input.regions ?? [])],
      constraints: [...(input.constraints ?? [])],
    },
  };
}

