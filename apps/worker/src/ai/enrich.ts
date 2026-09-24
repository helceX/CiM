import { getEnv } from "@cim/config";
import { getAIProvider } from "@cim/ai";
import {
  addMentionEntity,
  addMentionTopic,
  copyMentionEnrichmentAssignments,
  db,
  findCompletedEnrichmentForArticle,
  findOrCreateEntity,
  findOrCreateTopic,
  listPendingEnrichmentMentions,
  markMentionEnrichmentCompleted,
  markMentionEnrichmentFailed,
  markMentionEnrichmentSkipped,
} from "@cim/db";

const BATCH_SIZE = 25;

/**
 * docs/architecture/AI_ARCHITECTURE.md — runs after ingestion, never
 * inline in a request (brief §34/§91/§128). Cost-tiered: a completed
 * enrichment for the same Article (content-hash cache, findCompletedEnrichmentForArticle)
 * is reused before ever calling the provider again. A provider outage or
 * invalid-output failure marks the Mention `ai_status: failed` and moves
 * on — it never blocks ingestion, alerts, or any other mention's
 * enrichment (brief §92).
 */
export async function processAiEnrichJob(): Promise<{ processed: number; skipped: string }> {
  const provider = getAIProvider(getEnv());
  if (!provider) {
    return { processed: 0, skipped: "AI_PROVIDER is disabled" };
  }

  const candidates = await listPendingEnrichmentMentions(db, BATCH_SIZE);
  let processed = 0;

  for (const candidate of candidates) {
    if (!candidate.sourceCanProcessAi) {
      // SourcePolicy.can_process_ai forbids it (docs/architecture/SECURITY.md)
      // — enforced here, at enrichment time, not just documented.
      await markMentionEnrichmentSkipped(db, candidate.mentionId);
      continue;
    }

    const cached = await findCompletedEnrichmentForArticle(db, candidate.articleId);
    if (cached && cached.sentiment) {
      await markMentionEnrichmentCompleted(db, candidate.mentionId, {
        sentiment: cached.sentiment,
        sentimentConfidence: cached.sentimentConfidence ? Number(cached.sentimentConfidence) : 0,
        aiSummary: cached.aiSummary ?? "",
        aiMethod: cached.aiMethod ?? "",
      });
      await copyMentionEnrichmentAssignments(db, cached.mentionId, candidate.mentionId);
      processed += 1;
      continue;
    }

    const input = { title: candidate.title, text: candidate.excerpt ?? "" };
    try {
      const [sentiment, entityResult, topicResult, summary] = await Promise.all([
        provider.classifySentiment(input),
        provider.extractEntities(input),
        provider.detectTopics(input),
        provider.generateSummary(input),
      ]);

      // Marking "completed" runs last, only once every write below has
      // actually succeeded — otherwise a failure partway through (e.g. a
      // transient DB error on the 2nd of several entities) would leave
      // the mention flagged 'completed' with entities/topics missing,
      // and — since findCompletedEnrichmentForArticle's cache requires
      // ai_status='completed' — silently poison every other mention on
      // the same article into reusing this incomplete result instead of
      // hitting the catch below and being retried.
      await Promise.all([
        ...entityResult.entities.map(async (entity) => {
          const entityId = await findOrCreateEntity(db, entity.name, entity.type);
          await addMentionEntity(db, candidate.mentionId, entityId, entity.salience);
        }),
        ...topicResult.topics.map(async (topic) => {
          const topicId = await findOrCreateTopic(db, topic.name);
          await addMentionTopic(db, candidate.mentionId, topicId, topic.confidence);
        }),
      ]);

      await markMentionEnrichmentCompleted(db, candidate.mentionId, {
        sentiment: sentiment.sentiment,
        sentimentConfidence: sentiment.confidence,
        aiSummary: summary.summary,
        aiMethod: sentiment.method,
      });
      processed += 1;
    } catch (error) {
      console.error(`[worker] ai_enrich failed for mention ${candidate.mentionId}:`, error);
      await markMentionEnrichmentFailed(db, candidate.mentionId);
    }
  }

  return { processed, skipped: "" };
}
