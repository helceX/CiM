import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveMonitoringQuery, Db } from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector } from "./connector";

const mocks = vi.hoisted(() => ({
  findExistingArticle: vi.fn(),
  insertArticleWithOutcome: vi.fn(),
  findSimilarRecentArticle: vi.fn(),
  assignStoryCluster: vi.fn(),
  countClusterOutlets: vi.fn(),
  applyCoverageToCluster: vi.fn(),
  createMentionIfNotExists: vi.fn(),
  signalFor: vi.fn(),
}));

vi.mock("@cim/db", () => ({
  ...mocks,
  asOrganizationId: (id: string) => id,
  listActiveMonitoringQueriesForSourceType: vi.fn(),
  findOrCreateSocialProfile: vi.fn(),
  touchSocialProfile: vi.fn(),
}));

const { ingestSource } = await import("./pipeline");
const source = {
  id: "source",
  name: "Test Wire",
  type: "news",
  country: null,
  language: "en",
  canDisplayExcerpt: true,
} as Source;
const raw: RawFetchResult = {
  externalId: "story",
  canonicalUrl: "https://example.com/story",
  title: "Acme opens a new office",
  bodyText: "Acme opens a new office today.",
  publishedAt: new Date(),
};
const connector: SourceConnector = {
  fetch: async () => [raw],
  healthCheck: async () => ({ status: "healthy" }),
};
const article = {
  id: "article",
  sourceId: source.id,
  title: raw.title,
  publishedAt: raw.publishedAt,
  storyClusterId: null,
};
const query = {
  id: "query",
  organizationId: "org",
  projectId: "project",
  regionScopes: [],
  queryAst: { include: ["Acme"], exclude: [], exactPhrases: [] },
} as unknown as ActiveMonitoringQuery;
const db = {} as Db;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findExistingArticle.mockResolvedValue(undefined);
  mocks.insertArticleWithOutcome.mockResolvedValue({ article, created: false });
  mocks.findSimilarRecentArticle.mockResolvedValue({
    id: "candidate",
    storyClusterId: "cluster",
  });
  mocks.assignStoryCluster.mockResolvedValue("cluster");
  mocks.countClusterOutlets.mockResolvedValue(3);
  mocks.signalFor.mockReturnValue({ level: "normal", score: 1, reasons: null });
  mocks.createMentionIfNotExists.mockResolvedValue("mention");
});

describe("ingestion after a concurrent insert", () => {
  it("does not repeat clustering or count the winning row as newly created, but still matches mentions", async () => {
    const result = await ingestSource(db, source, connector, {
      activeQueries: [query],
    });
    expect(result.articlesCreated).toBe(0);
    expect(result.mentionsCreated).toBe(1);
    expect(mocks.findSimilarRecentArticle).not.toHaveBeenCalled();
    expect(mocks.assignStoryCluster).not.toHaveBeenCalled();
    expect(mocks.applyCoverageToCluster).not.toHaveBeenCalled();
    expect(mocks.createMentionIfNotExists).toHaveBeenCalledWith(
      db,
      "org",
      expect.objectContaining({ articleId: article.id }),
    );
  });

  it("uses the existing cluster returned by the conflict lookup for mention scoring", async () => {
    mocks.insertArticleWithOutcome.mockResolvedValue({
      article: { ...article, storyClusterId: "existing-cluster" },
      created: false,
    });
    await ingestSource(db, source, connector, { activeQueries: [query] });
    expect(mocks.countClusterOutlets).toHaveBeenCalledWith(db, "existing-cluster");
    expect(mocks.signalFor).toHaveBeenCalledWith(query, expect.any(Object), 3);
    expect(mocks.findSimilarRecentArticle).not.toHaveBeenCalled();
    expect(mocks.applyCoverageToCluster).not.toHaveBeenCalled();
  });

  it("still clusters, counts and propagates coverage for a genuinely new article", async () => {
    mocks.insertArticleWithOutcome.mockResolvedValue({ article, created: true });
    const result = await ingestSource(db, source, connector, {
      activeQueries: [query],
    });
    expect(result.articlesCreated).toBe(1);
    expect(mocks.findSimilarRecentArticle).toHaveBeenCalledTimes(1);
    expect(mocks.assignStoryCluster).toHaveBeenCalledWith(db, {
      articleId: article.id,
      candidate: { id: "candidate", storyClusterId: "cluster" },
    });
    expect(mocks.applyCoverageToCluster).toHaveBeenCalledWith(db, "cluster");
  });

  it("does not insert or cluster a row found by the initial lookup", async () => {
    mocks.findExistingArticle.mockResolvedValue(article);
    const result = await ingestSource(db, source, connector, {
      activeQueries: [query],
    });
    expect(result.articlesCreated).toBe(0);
    expect(mocks.insertArticleWithOutcome).not.toHaveBeenCalled();
    expect(mocks.findSimilarRecentArticle).not.toHaveBeenCalled();
  });
});
