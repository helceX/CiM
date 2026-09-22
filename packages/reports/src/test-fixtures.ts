import type { Article, Mention, Source } from "@cim/db/schema";
import type { ReportData } from "./gather-data";

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Wire",
    domain: "testwire.example",
    country: null,
    language: null,
    type: "news",
    connector: "mock",
    status: "healthy",
    lastCheckedAt: null,
    url: null,
    apiKeyHeaderName: null,
    apiKey: null,
    canStoreFullText: false,
    canDisplayFullText: false,
    canDisplayExcerpt: true,
    canStoreMedia: false,
    canProcessAi: true,
    license: null,
    termsUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function fakeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    sourceId: "11111111-1111-1111-1111-111111111111",
    canonicalUrl: "https://testwire.example/a",
    contentHash: "hash-a",
    title: "Test headline",
    storedExcerpt: "An excerpt.",
    language: "en",
    publishedAt: new Date("2026-01-02T00:00:00Z"),
    fetchedAt: new Date("2026-01-02T00:01:00Z"),
    authorName: null,
    storyClusterId: null,
    createdAt: new Date("2026-01-02T00:01:00Z"),
    ...overrides,
  };
}

function fakeMention(overrides: Partial<Mention> = {}): Mention {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    organizationId: "44444444-4444-4444-4444-444444444444",
    projectId: "55555555-5555-5555-5555-555555555555",
    queryId: "66666666-6666-6666-6666-666666666666",
    articleId: "22222222-2222-2222-2222-222222222222",
    matchedTerms: ["Test"],
    relevanceScore: null,
    sentiment: "positive",
    sentimentConfidence: "0.700",
    aiStatus: "completed",
    aiSummary: null,
    aiMethod: null,
    aiAnalyzedAt: null,
    priority: "normal",
    status: "new",
    reviewFeedback: null,
    assignedToUserId: null,
    createdAt: new Date("2026-01-02T00:01:00Z"),
    ...overrides,
  };
}

export function fakeReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    templateKey: "weekly_summary",
    sections: null,
    projectName: "Brand Monitoring",
    periodStart: new Date("2026-01-01T00:00:00Z"),
    periodEnd: new Date("2026-01-08T00:00:00Z"),
    sinceDays: 7,
    summary: {
      totalMentions: 12,
      uniqueSources: 3,
      positive: 5,
      neutral: 6,
      negative: 1,
      unclassified: 0,
      highPriority: 2,
    },
    volumeSeries: [
      { date: "2026-01-01", count: 2 },
      { date: "2026-01-02", count: 4 },
    ],
    sentimentSeries: [
      { date: "2026-01-01", positive: 1, neutral: 1, negative: 0, unclassified: 0 },
      { date: "2026-01-02", positive: 2, neutral: 2, negative: 0, unclassified: 0 },
    ],
    sourceDistribution: [{ sourceName: "Test Wire", count: 12 }],
    topStories: [
      {
        mention: fakeMention(),
        article: fakeArticle(),
        source: fakeSource(),
        assigneeName: null,
      },
      {
        mention: fakeMention({ id: "m2", sentiment: "negative" }),
        article: fakeArticle({
          id: "a2",
          title: 'A "quoted", tricky headline',
          canonicalUrl: "https://testwire.example/b",
        }),
        source: fakeSource(),
        assigneeName: null,
      },
    ],
    topicBreakdown: [{ queryId: "66666666-6666-6666-6666-666666666666", queryName: "Brand mentions", currentCount: 12, previousCount: 8 }],
    competitorComparison: [
      {
        queryId: "66666666-6666-6666-6666-666666666666",
        queryName: "Brand mentions",
        trackingTarget: "company",
        totalMentions: 12,
        positive: 5,
        neutral: 6,
        negative: 1,
      },
    ],
    insight: undefined,
    ...overrides,
  };
}
