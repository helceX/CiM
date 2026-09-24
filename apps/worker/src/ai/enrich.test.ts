import { describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (mocking @cim/ai and @cim/db entirely, no real
 * Postgres) rather than extending enrich.integration.test.ts — forcing
 * one specific write (findOrCreateEntity) to fail mid-batch needs
 * per-call control over a single @cim/db function while every other
 * call in that same integration test file legitimately hits real
 * Postgres, which a partial vi.mock of the whole @cim/db package would
 * risk disturbing. This proves the one invariant that matters: a
 * failure partway through entity/topic writes must never leave a
 * mention flagged 'completed'.
 */
const markMentionEnrichmentCompleted = vi.fn();
const markMentionEnrichmentFailed = vi.fn();
const markMentionEnrichmentSkipped = vi.fn();
const findOrCreateEntity = vi.fn();
const addMentionEntity = vi.fn();
const findOrCreateTopic = vi.fn();
const addMentionTopic = vi.fn();
const listPendingEnrichmentMentions = vi.fn();
const findCompletedEnrichmentForArticle = vi.fn();
const copyMentionEnrichmentAssignments = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listPendingEnrichmentMentions: (...args: unknown[]) => listPendingEnrichmentMentions(...args),
  findCompletedEnrichmentForArticle: (...args: unknown[]) => findCompletedEnrichmentForArticle(...args),
  markMentionEnrichmentCompleted: (...args: unknown[]) => markMentionEnrichmentCompleted(...args),
  markMentionEnrichmentFailed: (...args: unknown[]) => markMentionEnrichmentFailed(...args),
  markMentionEnrichmentSkipped: (...args: unknown[]) => markMentionEnrichmentSkipped(...args),
  findOrCreateEntity: (...args: unknown[]) => findOrCreateEntity(...args),
  addMentionEntity: (...args: unknown[]) => addMentionEntity(...args),
  findOrCreateTopic: (...args: unknown[]) => findOrCreateTopic(...args),
  addMentionTopic: (...args: unknown[]) => addMentionTopic(...args),
  copyMentionEnrichmentAssignments: (...args: unknown[]) => copyMentionEnrichmentAssignments(...args),
}));

const mockProvider = {
  name: "mock",
  classifySentiment: vi.fn(async () => ({ sentiment: "neutral", confidence: 0.5, method: "mock" })),
  extractEntities: vi.fn(async () => ({
    entities: [{ name: "Acme", type: "organization", salience: 0.9 }],
    method: "mock",
  })),
  detectTopics: vi.fn(async () => ({ topics: [], method: "mock" })),
  generateSummary: vi.fn(async () => ({ summary: "A summary.", method: "mock" })),
};
vi.mock("@cim/ai", () => ({
  getAIProvider: () => mockProvider,
}));

const { processAiEnrichJob } = await import("./enrich");

describe("processAiEnrichJob — entity/topic write failure isolation", () => {
  it("does not mark the mention completed when an entity write fails partway through", async () => {
    listPendingEnrichmentMentions.mockResolvedValueOnce([
      {
        mentionId: "mention-1",
        organizationId: "org-1",
        articleId: "article-1",
        title: "Acme wins big",
        excerpt: "Acme had a great quarter.",
        sourceCanProcessAi: true,
      },
    ]);
    findCompletedEnrichmentForArticle.mockResolvedValueOnce(undefined);
    findOrCreateEntity.mockRejectedValueOnce(new Error("transient DB error"));

    await processAiEnrichJob();

    expect(markMentionEnrichmentCompleted).not.toHaveBeenCalled();
    expect(markMentionEnrichmentFailed).toHaveBeenCalledWith(expect.anything(), "mention-1");
  });

  it("marks the mention completed only after every entity/topic write has succeeded", async () => {
    listPendingEnrichmentMentions.mockResolvedValueOnce([
      {
        mentionId: "mention-2",
        organizationId: "org-1",
        articleId: "article-2",
        title: "Acme wins again",
        excerpt: "Another great quarter.",
        sourceCanProcessAi: true,
      },
    ]);
    findCompletedEnrichmentForArticle.mockResolvedValueOnce(undefined);
    findOrCreateEntity.mockResolvedValueOnce("entity-1");
    addMentionEntity.mockResolvedValueOnce(undefined);

    await processAiEnrichJob();

    expect(markMentionEnrichmentFailed).not.toHaveBeenCalled();
    expect(markMentionEnrichmentCompleted).toHaveBeenCalledWith(
      expect.anything(),
      "mention-2",
      expect.objectContaining({ sentiment: "neutral" }),
    );
    // The completed-marking call happened strictly after the entity
    // write, not before it — order, not just "both happened".
    const entityCallOrder = addMentionEntity.mock.invocationCallOrder[0]!;
    const completedCallOrder = markMentionEnrichmentCompleted.mock.invocationCallOrder[0]!;
    expect(completedCallOrder).toBeGreaterThan(entityCallOrder);
  });
});
