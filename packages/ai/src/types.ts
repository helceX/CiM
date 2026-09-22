import { z } from "zod";

/**
 * docs/architecture/AI_ARCHITECTURE.md — every provider method's output is
 * validated against one of these schemas before being trusted anywhere in
 * the system. An invalid/unparseable response is never passed through.
 */

export const sentimentLabelSchema = z.enum(["positive", "neutral", "negative"]);
export type SentimentLabel = z.infer<typeof sentimentLabelSchema>;

export const sentimentOutputSchema = z.object({
  sentiment: sentimentLabelSchema,
  confidence: z.number().min(0).max(1),
});
export type SentimentOutput = z.infer<typeof sentimentOutputSchema>;

export const entityTypeSchema = z.enum([
  "company",
  "brand",
  "person",
  "product",
  "organization",
  "place",
  "other",
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const entityOutputSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: entityTypeSchema,
        salience: z.number().min(0).max(1),
      }),
    )
    .max(20),
});
export type EntityOutput = z.infer<typeof entityOutputSchema>;

export const topicOutputSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(10),
});
export type TopicOutput = z.infer<typeof topicOutputSchema>;

export const summaryOutputSchema = z.object({
  summary: z.string().min(1).max(600),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export const insightOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1),
  evidenceMentionIds: z.array(z.string()).min(1).max(50),
});
export type InsightOutput = z.infer<typeof insightOutputSchema>;

/** Every result crossing the AIProvider boundary carries how it was produced (brief §42–44). */
export type WithMethod<T> = T & { method: string };

export type ClassifySentimentInput = { title: string; text: string };
export type ExtractEntitiesInput = { title: string; text: string };
export type DetectTopicsInput = { title: string; text: string };
export type GenerateSummaryInput = { title: string; text: string };

export type InsightSourceMention = {
  id: string;
  title: string;
  sourceName: string;
  sentiment: SentimentLabel | null;
  priority: string;
  publishedAt: string | null;
};

export type GenerateInsightInput = {
  periodLabel: string;
  mentions: InsightSourceMention[];
};

/**
 * docs/architecture/AI_ARCHITECTURE.md "Grounded, contextual assistant"
 * (brief §97–98) — same Answer/Evidence/Confidence trust contract as
 * every other AI surface. `evidenceMentionIds` may be empty (unlike
 * `InsightOutput`'s, which requires at least one) — a question like "how
 * many sources do I have configured?" or "no mentions matched" has a
 * true, grounded answer that cites nothing.
 */
export const assistantAnswerOutputSchema = z.object({
  answer: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1),
  evidenceMentionIds: z.array(z.string()).max(50),
});
export type AssistantAnswerOutput = z.infer<typeof assistantAnswerOutputSchema>;

export type AssistantAnswerInput = {
  question: string;
  /** e.g. "Viewing the Dashboard" — what the user was looking at when they asked. */
  screenContext: string;
  mentions: InsightSourceMention[];
};
