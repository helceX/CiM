import { conceptKey, conceptOfTerm, effectiveAliasGroups } from "./concepts";
import type { GoalKey, MonitoringIntent, SignalLevel } from "./intent";
import { keywordMatches, prepareText, type MatchOptions } from "./keyword-match";
import { companyNames, type QueryAst } from "./query-ast";
import { goalLabel, goalWords } from "./signal-goals";
import { sourceKindOfType } from "./source-categories";

/**
 * How much a story that matched a monitoring matters, and why (docs/product/SIGNAL_AND_INTENT.md).
 *
 * Deterministic and explainable by design — no model decides it, so it works without an AI key, costs
 * nothing per story, and every point can be traced to a sentence the person can read. Each factor that
 * moves the score also leaves a reason, so "why am I seeing this?" always has a complete answer.
 *
 * The factors, strongest first:
 *  - where the tracked words are: in the headline, in the opening lines, or only deeper in the story;
 *  - whether they name the thing itself (a company, a brand, a person) or a topic — a topic word in a
 *    headline is a weaker sign than a name;
 *  - an exact company name or exact phrase;
 *  - how many of the tracked things the story touches;
 *  - words that point at what the person is looking for (risks, opportunities …);
 *  - whether a news outlet published it;
 *  - how many outlets carry the same story.
 */
export type SignalReason =
  | { code: "headline"; terms: string[] }
  | { code: "lead"; terms: string[] }
  | { code: "deep" }
  | { code: "identity"; terms: string[] }
  | { code: "several"; n: number }
  | { code: "goal"; goal: GoalKey | "custom"; terms: string[]; where: "headline" | "text" }
  | { code: "covered"; n: number }
  | { code: "editorial" };

export type Signal = {
  /** An ordering key, not a percentage: higher is more important. */
  score: number;
  level: SignalLevel;
  reasons: SignalReason[];
};

export type SignalInput = {
  ast: QueryAst;
  /** The monitoring's tracking target (company, brand, topic …): names weigh more than topics. */
  target?: string | null;
  intent?: MonitoringIntent | null;
  title: string;
  lead?: string | null;
  language?: string | null;
  sourceType: string;
  /** Distinct outlets carrying the same story; 1 (or nothing) when it stands alone. */
  outlets?: number;
};

/** The opening lines are the first characters of the story — the same stretch the product stores. */
export const OPENING_CHARS = 200;

export const HIGH_AT = 60;
export const NORMAL_AT = 30;

const W = {
  headline: { name: 55, topic: 32 },
  lead: { name: 32, topic: 14 },
  deep: 8,
  identity: 8,
  severalEach: 7,
  severalMax: 14,
  goalHeadline: 12,
  goalLead: 7,
  goalPerGoalMax: 24,
  goalTotalMax: 36,
  editorial: 6,
  covered3: 10,
  covered6: 18,
} as const;

/** Tracking targets that name a particular thing; the others (topic, industry) are subjects. */
const NAMED_TARGETS = new Set(["company", "brand", "product", "competitor", "person", "campaign"]);

export function levelOfScore(score: number): SignalLevel {
  return score >= HIGH_AT ? "high" : score >= NORMAL_AT ? "normal" : "low";
}

function coverageBonus(outlets: number): number {
  return outlets >= 6 ? W.covered6 : outlets >= 3 ? W.covered3 : 0;
}

function top(terms: readonly string[]): string[] {
  return terms.slice(0, 3);
}

function unique(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const key = conceptKey(term) || term;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

const groupCache = new Map<string, string[][]>();

/** The monitoring's concepts (explicit groups plus automatic word families), cached per keyword set. */
function groupsFor(ast: QueryAst, keywords: readonly string[]): string[][] {
  const key = JSON.stringify([ast.aliasGroups ?? [], keywords]);
  let groups = groupCache.get(key);
  if (!groups) {
    groups = effectiveAliasGroups(ast.aliasGroups, keywords);
    if (groupCache.size >= 300) groupCache.clear();
    groupCache.set(key, groups);
  }
  return groups;
}

/**
 * Scores one story that matched a monitoring. Only call it for a story the monitoring already holds (or
 * is about to): it judges how much the match matters, not whether there is one.
 */
export function scoreSignal(input: SignalInput): Signal {
  const { ast } = input;
  const options: MatchOptions = { language: input.language };
  const titleTexts = prepareText(input.title);
  const leadTexts = prepareText((input.lead ?? "").slice(0, OPENING_CHARS));

  const identityTerms = [...ast.exactPhrases, ...companyNames(ast)];
  const tracked = unique([...identityTerms, ...ast.include]);
  const inTitle = tracked.filter((term) => keywordMatches(term, titleTexts, options));
  const inLead = tracked.filter((term) => !inTitle.includes(term) && keywordMatches(term, leadTexts, options));

  const named = NAMED_TARGETS.has(input.target ?? "") || Boolean(ast.company?.name);
  const reasons: SignalReason[] = [];
  let score: number;
  if (inTitle.length > 0) {
    score = named ? W.headline.name : W.headline.topic;
    reasons.push({ code: "headline", terms: top(inTitle) });
  } else if (inLead.length > 0) {
    score = named ? W.lead.name : W.lead.topic;
    reasons.push({ code: "lead", terms: top(inLead) });
  } else {
    // Matched on words beyond the stored lines (or by earlier keywords): known, but only deep in the story.
    score = W.deep;
    reasons.push({ code: "deep" });
  }

  const hits = [...inTitle, ...inLead];
  const identityKeys = new Set(identityTerms.map(conceptKey));
  const identityHits = hits.filter((term) => identityKeys.has(conceptKey(term)));
  if (identityHits.length > 0) {
    score += W.identity;
    reasons.push({ code: "identity", terms: top(identityHits) });
  }

  if (hits.length > 1) {
    const groups = groupsFor(ast, [...ast.include, ...ast.exactPhrases]);
    const concepts = new Set(hits.map((term) => conceptKey(conceptOfTerm(groups, term).label)));
    if (concepts.size >= 2) {
      score += Math.min(W.severalMax, (concepts.size - 1) * W.severalEach);
      reasons.push({ code: "several", n: concepts.size });
    }
  }

  // Words that point at what the person is looking for. A word that is already one of the tracked
  // terms (or sits inside one) is not counted twice.
  const trackedTexts = tracked.map((term) => prepareText(term));
  const shadowed = (word: string) => trackedTexts.some((text) => keywordMatches(word, text, options));
  const packs: { goal: GoalKey | "custom"; words: readonly string[] }[] = [];
  for (const goal of input.intent?.goals ?? []) if (goal !== "coverage") packs.push({ goal, words: goalWords(goal) });
  if (input.intent?.signalWords.length) packs.push({ goal: "custom", words: input.intent.signalWords });
  let goalTotal = 0;
  for (const pack of packs) {
    const usable = pack.words.filter((word) => !shadowed(word));
    const inTitleWords = usable.filter((word) => keywordMatches(word, titleTexts, options));
    const inLeadWords = usable.filter((word) => !inTitleWords.includes(word) && keywordMatches(word, leadTexts, options));
    const points = Math.min(W.goalPerGoalMax, inTitleWords.length * W.goalHeadline + inLeadWords.length * W.goalLead);
    if (points === 0) continue;
    goalTotal += points;
    reasons.push({
      code: "goal",
      goal: pack.goal,
      terms: top([...inTitleWords, ...inLeadWords]),
      where: inTitleWords.length > 0 ? "headline" : "text",
    });
  }
  score += Math.min(W.goalTotalMax, goalTotal);

  const outlets = input.outlets ?? 1;
  if (outlets >= 3) {
    score += coverageBonus(outlets);
    reasons.push({ code: "covered", n: outlets });
  }
  if (sourceKindOfType(input.sourceType) === "news") {
    score += W.editorial;
    reasons.push({ code: "editorial" });
  }

  const rounded = Math.round(score);
  return { score: rounded, level: levelOfScore(rounded), reasons };
}

/**
 * The same signal once more outlets carry the story (or fewer — it is recomputed, never added to, so
 * applying it twice changes nothing). A story that starts alone and is picked up by six outlets climbs.
 */
export function applyCoverage(signal: Signal, outlets: number): Signal {
  const previous = signal.reasons.find((reason) => reason.code === "covered");
  const before = previous?.code === "covered" ? previous.n : 1;
  const score = signal.score - coverageBonus(before) + coverageBonus(outlets);
  const reasons: SignalReason[] = signal.reasons.filter((reason) => reason.code !== "covered");
  if (outlets >= 3) {
    const at = reasons.findIndex((reason) => reason.code === "editorial");
    reasons.splice(at < 0 ? reasons.length : at, 0, { code: "covered", n: outlets });
  }
  return { score, level: levelOfScore(score), reasons };
}

export const SIGNAL_LEVEL_LABEL: Record<SignalLevel, string> = {
  high: "Important",
  normal: "Worth a look",
  low: "Passing mention",
};

export function signalLevelLabel(priority: string): string {
  return SIGNAL_LEVEL_LABEL[priority === "critical" ? "high" : (priority as SignalLevel)] ?? priority;
}

function quoted(terms: readonly string[]): string {
  return terms.map((term) => `“${term}”`).join(", ");
}

function reasonLine(reason: SignalReason): string {
  switch (reason.code) {
    case "headline":
      return `The headline names ${quoted(reason.terms)}`;
    case "lead":
      return `The opening lines name ${quoted(reason.terms)}`;
    case "deep":
      return "Found deeper in the story — not in the headline or the opening lines";
    case "identity":
      return `Exact match on ${quoted(reason.terms)}`;
    case "several":
      return `Touches ${reason.n} of the things you track`;
    case "goal":
      return `${goalLabel(reason.goal)}: ${quoted(reason.terms)} ${reason.where === "headline" ? "in the headline" : "in the text"}`;
    case "covered":
      return `Reported by ${reason.n} outlets`;
    case "editorial":
      return "Published by a news outlet";
  }
}

export type SignalDescription = {
  level: SignalLevel;
  label: string;
  /** One line per reason, strongest first — the full answer to "why am I seeing this?". */
  lines: string[];
  /** The first two reasons, for a story card. */
  short: string;
};

/** Plain-language account of a stored signal. Null when the story has not been scored yet. */
export function describeSignal(
  priority: string,
  reasons: readonly SignalReason[] | null | undefined,
): SignalDescription | null {
  if (!reasons || reasons.length === 0) return null;
  const level = (priority === "critical" ? "high" : priority) as SignalLevel;
  const lines = reasons.map(reasonLine);
  const core = reasons.filter((reason) => reason.code !== "editorial" && reason.code !== "identity");
  const shortSource = core.length > 0 ? core : reasons;
  return {
    level,
    label: signalLevelLabel(priority),
    lines,
    short: shortSource.slice(0, 2).map(reasonLine).join(" · "),
  };
}
