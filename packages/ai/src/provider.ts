import type {
  AssistantAnswerInput,
  AssistantAnswerOutput,
  ClassifySentimentInput,
  DetectTopicsInput,
  EntityOutput,
  ExtractEntitiesInput,
  GenerateInsightInput,
  GenerateRecommendationsInput,
  GenerateRiskInput,
  GenerateSummaryInput,
  InsightOutput,
  QueryReviewInput,
  QueryReviewOutput,
  RecommendationsOutput,
  RiskOutput,
  SentimentOutput,
  SummaryOutput,
  TopicOutput,
  WithMethod,
} from "./types";

/**
 * docs/architecture/AI_ARCHITECTURE.md / ADR-003 — provider-agnostic
 * interface. MVP subset (brief §151 Phase 6): sentiment, entities, topics,
 * per-article summary, and a project-level grounded insight.
 * `generateRecommendations` and `detectRisk` joined the interface once
 * that scope was actually built, per this file's own stated convention of
 * not stubbing ahead of it — `detectRisk` was the last one still unbuilt.
 *
 * Every method can fail (provider outage, invalid output) — callers treat
 * a thrown error as "enrichment not available yet", never a crash of the
 * ingestion/alert/dashboard path it's enhancing (brief §92).
 */
export interface AIProvider {
  readonly name: string;
  classifySentiment(input: ClassifySentimentInput): Promise<WithMethod<SentimentOutput>>;
  extractEntities(input: ExtractEntitiesInput): Promise<WithMethod<EntityOutput>>;
  detectTopics(input: DetectTopicsInput): Promise<WithMethod<TopicOutput>>;
  generateSummary(input: GenerateSummaryInput): Promise<WithMethod<SummaryOutput>>;
  generateInsight(input: GenerateInsightInput): Promise<WithMethod<InsightOutput>>;
  generateRecommendations(
    input: GenerateRecommendationsInput,
  ): Promise<WithMethod<RecommendationsOutput>>;
  detectRisk(input: GenerateRiskInput): Promise<WithMethod<RiskOutput>>;
  answerQuestion(input: AssistantAnswerInput): Promise<WithMethod<AssistantAnswerOutput>>;
  reviewQuery(input: QueryReviewInput): Promise<WithMethod<QueryReviewOutput>>;
}
