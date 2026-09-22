import type { AIProvider } from "./provider";
import type {
  AssistantAnswerInput,
  AssistantAnswerOutput,
  ClassifySentimentInput,
  DetectTopicsInput,
  EntityOutput,
  EntityType,
  ExtractEntitiesInput,
  GenerateInsightInput,
  GenerateSummaryInput,
  InsightOutput,
  SentimentOutput,
  SummaryOutput,
  TopicOutput,
  WithMethod,
} from "./types";

const METHOD = "mock-heuristic-v1";

const POSITIVE_WORDS = [
  "award",
  "growth",
  "success",
  "win",
  "wins",
  "record",
  "praise",
  "praised",
  "strong",
  "improve",
  "improved",
  "innovative",
  "best",
  "leading",
  "expand",
  "expands",
  "positive",
  "boost",
  "surge",
  "upgrade",
];

const NEGATIVE_WORDS = [
  "recall",
  "lawsuit",
  "breach",
  "scandal",
  "complaint",
  "decline",
  "loss",
  "fail",
  "failed",
  "failure",
  "crisis",
  "delay",
  "delayed",
  "criticism",
  "criticized",
  "negative",
  "cut",
  "layoff",
  "layoffs",
  "concern",
  "concerns",
  "risk",
];

const TOPIC_VOCABULARY: Record<string, string[]> = {
  Product: ["launch", "launches", "release", "released", "update", "feature", "unveil"],
  Financial: ["quarterly", "earnings", "revenue", "results", "profit", "financial"],
  Leadership: ["ceo", "executive", "appoints", "appointed", "resigns", "resignation"],
  "Market Expansion": ["market", "region", "expands", "expansion", "international"],
  Customer: ["customer", "customers", "feedback", "complaint", "review", "reviews"],
  Competition: ["competitor", "competitors", "rival", "rivals"],
  Crisis: ["recall", "lawsuit", "breach", "scandal", "investigation"],
};

const COMPANY_SUFFIXES = ["Inc", "Corp", "Corporation", "Ltd", "LLC", "Group", "Holdings"];

function tokenizeWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

/**
 * docs/architecture/AI_ARCHITECTURE.md — MockAIProvider is a deterministic,
 * lexicon/heuristic implementation behind the same `AIProvider` interface a
 * real model provider fills (see `anthropic-provider.ts`). It never claims
 * to be a language model: every output's `method` says "mock-heuristic-v1"
 * so the UI's trust layer (confidence + method, brief §42–44) shows users
 * exactly what produced it. It exists for local dev/test and for demo
 * environments without a provider API key configured — the same role
 * `MockNewsConnector` plays for ingestion (ADR-004).
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async classifySentiment(input: ClassifySentimentInput): Promise<WithMethod<SentimentOutput>> {
    const words = tokenizeWords(`${input.title} ${input.text}`);
    let score = 0;
    for (const word of words) {
      if (POSITIVE_WORDS.includes(word)) score += 1;
      if (NEGATIVE_WORDS.includes(word)) score -= 1;
    }
    const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
    const confidence = score === 0 ? 0.4 : Math.min(0.9, 0.5 + Math.abs(score) * 0.1);
    return { sentiment, confidence, method: METHOD };
  }

  async extractEntities(input: ExtractEntitiesInput): Promise<WithMethod<EntityOutput>> {
    const matches = input.title.match(/\b(?:[A-Z][a-zA-Z0-9'&]*\s?){1,4}\b/g) ?? [];
    const seen = new Map<string, number>();
    for (const raw of matches) {
      const name = raw.trim();
      if (name.length < 2) continue;
      const firstWord = name.split(" ")[0];
      if (!firstWord || firstWord === firstWord.toLowerCase()) continue;
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    const entities = Array.from(seen.entries())
      .slice(0, 5)
      .map(([name, count], index): EntityOutput["entities"][number] => {
        const type: EntityType = COMPANY_SUFFIXES.some((suffix) => name.endsWith(suffix))
          ? "company"
          : "other";
        const salience = Math.max(0.2, Math.min(0.9, 0.8 - index * 0.15 + count * 0.05));
        return { name, type, salience };
      });
    return { entities, method: METHOD };
  }

  async detectTopics(input: DetectTopicsInput): Promise<WithMethod<TopicOutput>> {
    const words = new Set(tokenizeWords(`${input.title} ${input.text}`));
    const topics: TopicOutput["topics"] = [];
    for (const [topic, vocabulary] of Object.entries(TOPIC_VOCABULARY)) {
      const hits = vocabulary.filter((term) => words.has(term)).length;
      if (hits === 0) continue;
      topics.push({ name: topic, confidence: Math.min(0.9, 0.4 + hits * 0.2) });
    }
    topics.sort((a, b) => b.confidence - a.confidence);
    return { topics: topics.slice(0, 5), method: METHOD };
  }

  async generateSummary(input: GenerateSummaryInput): Promise<WithMethod<SummaryOutput>> {
    const firstSentence = input.text.split(/(?<=[.!?])\s/)[0] ?? input.text;
    const summary = `${input.title}. ${firstSentence}`.trim().slice(0, 400);
    return { summary, method: METHOD };
  }

  async generateInsight(input: GenerateInsightInput): Promise<WithMethod<InsightOutput>> {
    if (input.mentions.length === 0) {
      throw new Error("generateInsight requires at least one mention as evidence");
    }
    const positive = input.mentions.filter((m) => m.sentiment === "positive").length;
    const negative = input.mentions.filter((m) => m.sentiment === "negative").length;
    const neutralOrUnclassified = input.mentions.length - positive - negative;
    const highPriority = input.mentions.filter(
      (m) => m.priority === "high" || m.priority === "critical",
    ).length;

    const parts = [
      `${input.mentions.length} new mention${input.mentions.length === 1 ? "" : "s"} in ${input.periodLabel}`,
      `${positive} positive, ${negative} negative, ${neutralOrUnclassified} neutral/unclassified`,
    ];
    if (highPriority > 0) {
      parts.push(`${highPriority} high-priority match${highPriority === 1 ? "" : "es"}`);
    }
    const summary = parts.join(" — ") + ".";

    return {
      summary,
      confidence: 0.9,
      evidenceMentionIds: input.mentions.slice(0, 50).map((m) => m.id),
      method: METHOD,
    };
  }

  async answerQuestion(input: AssistantAnswerInput): Promise<WithMethod<AssistantAnswerOutput>> {
    const questionWords = new Set(tokenizeWords(input.question));
    const scored = input.mentions
      .map((mention) => {
        const overlap = tokenizeWords(`${mention.title} ${mention.sourceName}`).filter((w) =>
          questionWords.has(w),
        ).length;
        return { mention, overlap };
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);

    if (scored.length === 0) {
      return {
        answer:
          input.mentions.length === 0
            ? "I don't have any mentions to check yet — nothing has been crawled for this project."
            : `I couldn't find any of your ${input.mentions.length} recent mentions that relate to that question.`,
        confidence: 0.3,
        evidenceMentionIds: [],
        method: METHOD,
      };
    }

    const top = scored.slice(0, 5);
    const positive = top.filter((s) => s.mention.sentiment === "positive").length;
    const negative = top.filter((s) => s.mention.sentiment === "negative").length;
    const answer =
      `Found ${top.length} relevant mention${top.length === 1 ? "" : "s"}: ` +
      top.map((s) => `"${s.mention.title}" (${s.mention.sourceName})`).join(", ") +
      (positive || negative ? ` — ${positive} positive, ${negative} negative.` : ".");

    return {
      answer,
      confidence: Math.min(0.8, 0.4 + top[0]!.overlap * 0.1),
      evidenceMentionIds: top.map((s) => s.mention.id),
      method: METHOD,
    };
  }
}
