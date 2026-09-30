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

  /**
   * Regression: the cached-enrichment path (findCompletedEnrichmentForArticle
   * hit) used to call markMentionEnrichmentCompleted *before*
   * copyMentionEnrichmentAssignments, with no try/catch around either —
   * the opposite of the "completed last" discipline the two tests above
   * already enforce for the non-cached path, and inconsistent with every
   * other per-candidate isolation in this codebase. A copy failure left
   * the mention permanently marked 'completed' with no entities/topics
   * ever copied (unretryable, since aiStatus='completed' excludes it from
   * listPendingEnrichmentMentions forever), and — uncaught — aborted the
   * whole batch, silently starving every other pending mention that tick.
   */
  it("does not mark the mention completed when the cached-path entity/topic copy fails, and still processes the rest of the batch", async () => {
    listPendingEnrichmentMentions.mockResolvedValueOnce([
      {
        mentionId: "mention-3",
        organizationId: "org-1",
        articleId: "article-3",
        title: "Acme, cached",
        excerpt: "Same article as an already-enriched mention.",
        sourceCanProcessAi: true,
      },
      {
        mentionId: "mention-4",
        organizationId: "org-1",
        articleId: "article-4",
        title: "Acme, fresh",
        excerpt: "A different article entirely.",
        sourceCanProcessAi: true,
      },
    ]);
    findCompletedEnrichmentForArticle.mockResolvedValueOnce({
      mentionId: "mention-0",
      sentiment: "positive",
      sentimentConfidence: "0.8",
      aiSummary: "Cached summary.",
      aiMethod: "mock",
    });
    copyMentionEnrichmentAssignments.mockRejectedValueOnce(new Error("transient DB error"));
    findCompletedEnrichmentForArticle.mockResolvedValueOnce(undefined);
    findOrCreateEntity.mockResolvedValueOnce("entity-1");
    addMentionEntity.mockResolvedValueOnce(undefined);

    await processAiEnrichJob();

    expect(markMentionEnrichmentCompleted).not.toHaveBeenCalledWith(
      expect.anything(),
      "mention-3",
      expect.anything(),
    );
    expect(markMentionEnrichmentFailed).toHaveBeenCalledWith(expect.anything(), "mention-3");
    // The second candidate in the batch still gets processed — one
    // candidate's uncaught failure no longer aborts the whole tick.
    expect(markMentionEnrichmentCompleted).toHaveBeenCalledWith(
      expect.anything(),
      "mention-4",
      expect.objectContaining({ sentiment: "neutral" }),
    );
  });
});
