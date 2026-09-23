import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import {
  asOrganizationId,
  createAlertRule,
  createProject,
  createMonitoringQuery,
  db,
  listNotifications,
  schema,
} from "@cim/db";
import { ingestSource, MockNewsConnector } from "@cim/ingestion";
import { evaluateNewMentionAlerts } from "./evaluate";
import { evaluateSpikeAlerts } from "./evaluate-spikes";
import { evaluateSentimentShiftAlerts } from "./evaluate-sentiment-shift";
import { evaluateEmergingTopicAlerts } from "./evaluate-emerging-topics";
import { evaluateCompetitorAlerts } from "./evaluate-competitor";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) — proves the alert
 * engine end to end against real Postgres: keyword alerts fire on any
 * new mention, high-relevance alerts fire only on an exact-phrase match,
 * cooldown suppresses a duplicate notification, and spike alerts fire
 * off the real statistical baseline query.
 */
describe("alert engine (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let workspaceId: string;
  let projectId: string;
  let userId: string;
  let sourceId: string;
  const emailQueue = {
    add: async () => undefined,
  } as unknown as Queue<SendEmailJobData>;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Alert Test Co", slug: `alert-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");
    workspaceId = workspace.id;

    const project = await createProject(db, organizationId, {
      workspaceId,
      name: "Alert Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `alert-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Alert",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;

    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "organization_owner",
      status: "active",
    });

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Alert Test Wire",
        domain: `alert-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("fires a keyword alert on any new mention and suppresses a repeat within cooldown", async () => {
    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Keyword alert query",
      queryAst: { include: ["Alert Test Wire"], exclude: [], exactPhrases: [] },
      booleanQuery: "Alert Test Wire",
      sourceTypes: ["news"],
    });

    const rule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: query.id,
      createdByUserId: userId,
      name: "Keyword rule",
      type: "keyword",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const result = await ingestSource(db, source, new MockNewsConnector());
    expect(result.newMentions.length).toBeGreaterThan(0);

    await evaluateNewMentionAlerts(emailQueue, result.newMentions);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 10,
    });
    const matching = notifications.filter((n) => n.title === rule.name);
    expect(matching.length).toBe(1);

    // Evaluating the exact same trigger again immediately must not send a
    // second notification — the rule's 60-minute cooldown is still active
    // (brief §19–20 alert fatigue).
    await evaluateNewMentionAlerts(emailQueue, result.newMentions);
    const notificationsAfterRepeat = await listNotifications(
      db,
      organizationId,
      userId,
      { limit: 10 },
    );
    expect(notificationsAfterRepeat.filter((n) => n.title === rule.name).length).toBe(
      1,
    );
  });

  it("fires a high-relevance alert only on an exact-phrase match, not a loose keyword match", async () => {
    const looseQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "High relevance — loose",
      queryAst: { include: ["Alert Test Wire"], exclude: [], exactPhrases: [] },
      booleanQuery: "Alert Test Wire",
      sourceTypes: ["news"],
    });
    const looseRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: looseQuery.id,
      createdByUserId: userId,
      name: "High relevance rule (loose)",
      type: "high_relevance",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");
    const result = await ingestSource(db, source, new MockNewsConnector());

    await evaluateNewMentionAlerts(emailQueue, result.newMentions);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    expect(notifications.some((n) => n.title === looseRule.name)).toBe(false);
  });

  it("computes a spike alert off the real statistical baseline and fires above threshold", async () => {
    const spikeQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Spike query",
      queryAst: { include: ["spike-test-marker"], exclude: [], exactPhrases: [] },
      booleanQuery: "spike-test-marker",
      sourceTypes: ["news"],
    });
    const spikeRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: spikeQuery.id,
      createdByUserId: userId,
      name: "Spike rule",
      type: "spike",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    // Baseline: ~1 mention/hour for the last 20 hours (quiet history).
    const baselineArticles = [];
    for (let hoursAgo = 20; hoursAgo >= 2; hoursAgo -= 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://spike-test.example/baseline-${hoursAgo}`,
          contentHash: `spike-baseline-${hoursAgo}`,
          title: `spike-test-marker baseline item ${hoursAgo}`,
        })
        .returning();
      if (!article) throw new Error("failed to create baseline article");
      baselineArticles.push(article);
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: spikeQuery.id,
        articleId: article.id,
        matchedTerms: ["spike-test-marker"],
        createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      });
    }

    // Spike: 10 mentions in the current hour.
    for (let i = 0; i < 10; i += 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://spike-test.example/spike-${i}`,
          contentHash: `spike-current-${i}`,
          title: `spike-test-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create spike article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: spikeQuery.id,
        articleId: article.id,
        matchedTerms: ["spike-test-marker"],
      });
    }

    await evaluateSpikeAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    const spikeNotification = notifications.find((n) => n.title === spikeRule.name);
    expect(spikeNotification).toBeDefined();
    expect(spikeNotification?.body).toMatch(/baseline/i);
  });

  it("fires a sentiment-shift alert when negative share jumps over the trailing-week baseline", async () => {
    const sentimentQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Sentiment shift query",
      queryAst: { include: ["sentiment-shift-marker"], exclude: [], exactPhrases: [] },
      booleanQuery: "sentiment-shift-marker",
      sourceTypes: ["news"],
    });
    const sentimentRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: sentimentQuery.id,
      createdByUserId: userId,
      name: "Sentiment shift rule",
      type: "sentiment_shift",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    // Baseline: 10 classified mentions over the trailing week, mostly
    // positive/neutral (2 negative = 20% negative share).
    const baselineSentiments = [
      "positive",
      "positive",
      "neutral",
      "neutral",
      "neutral",
      "neutral",
      "neutral",
      "neutral",
      "negative",
      "negative",
    ];
    for (const [i, sentiment] of baselineSentiments.entries()) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://sentiment-test.example/baseline-${i}`,
          contentHash: `sentiment-baseline-${i}`,
          title: `sentiment-shift-marker baseline item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create baseline article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: sentimentQuery.id,
        articleId: article.id,
        matchedTerms: ["sentiment-shift-marker"],
        sentiment,
        createdAt: new Date(Date.now() - (2 + i / 2) * 24 * 60 * 60 * 1000),
      });
    }

    // Current window: 5 classified mentions in the last few hours, mostly
    // negative (4 negative = 80% negative share — well over the +30pt
    // shift threshold against the 20% baseline).
    const currentSentiments = [
      "negative",
      "negative",
      "negative",
      "negative",
      "neutral",
    ];
    for (const [i, sentiment] of currentSentiments.entries()) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://sentiment-test.example/current-${i}`,
          contentHash: `sentiment-current-${i}`,
          title: `sentiment-shift-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create current article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: sentimentQuery.id,
        articleId: article.id,
        matchedTerms: ["sentiment-shift-marker"],
        sentiment,
        createdAt: new Date(Date.now() - i * 60 * 60 * 1000),
      });
    }

    await evaluateSentimentShiftAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    const sentimentNotification = notifications.find(
      (n) => n.title === sentimentRule.name,
    );
    expect(sentimentNotification).toBeDefined();
    expect(sentimentNotification?.body).toMatch(/negative sentiment/i);
  });

  it("labels a fired sentiment-shift alert as having no baseline, not a misleading '~0%', when there's no classified history at all", async () => {
    const freshQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Fresh sentiment query, no baseline yet",
      queryAst: { include: ["fresh-sentiment-marker"], exclude: [], exactPhrases: [] },
      booleanQuery: "fresh-sentiment-marker",
      sourceTypes: ["news"],
    });
    const freshRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: freshQuery.id,
      createdByUserId: userId,
      name: "Fresh sentiment rule",
      type: "sentiment_shift",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    // No baseline mentions at all — only a current window, all negative.
    // baselineNegativeShare defaults to 0 with zero classified history,
    // which is a different fact from "we checked and it was 0% negative"
    // and must be worded differently in the fired alert.
    for (let i = 0; i < 3; i++) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://sentiment-test.example/fresh-${i}`,
          contentHash: `sentiment-fresh-${i}`,
          title: `fresh-sentiment-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create fresh article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: freshQuery.id,
        articleId: article.id,
        matchedTerms: ["fresh-sentiment-marker"],
        sentiment: "negative",
        createdAt: new Date(Date.now() - i * 60 * 60 * 1000),
      });
    }

    await evaluateSentimentShiftAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, { limit: 50 });
    const notification = notifications.find((n) => n.title === freshRule.name);
    expect(notification).toBeDefined();
    expect(notification?.body).toMatch(/no classified baseline/i);
    expect(notification?.body).not.toMatch(/vs\. ~0%/i);
  });

  it("does not fire a sentiment-shift alert without enough classified mentions in the current window", async () => {
    const quietQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Sentiment shift quiet query",
      queryAst: { include: ["sentiment-quiet-marker"], exclude: [], exactPhrases: [] },
      booleanQuery: "sentiment-quiet-marker",
      sourceTypes: ["news"],
    });
    const quietRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: quietQuery.id,
      createdByUserId: userId,
      name: "Sentiment shift quiet rule",
      type: "sentiment_shift",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    // Only 2 classified mentions, both negative — below MIN_CLASSIFIED_COUNT (3).
    for (let i = 0; i < 2; i += 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://sentiment-quiet.example/current-${i}`,
          contentHash: `sentiment-quiet-current-${i}`,
          title: `sentiment-quiet-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create current article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId,
        queryId: quietQuery.id,
        articleId: article.id,
        matchedTerms: ["sentiment-quiet-marker"],
        sentiment: "negative",
      });
    }

    await evaluateSentimentShiftAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    expect(notifications.some((n) => n.title === quietRule.name)).toBe(false);
  });

  it("fires an emerging-topic alert when a topic surges over the trailing-week baseline", async () => {
    const topicQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Emerging topic query",
      queryAst: { include: ["emerging-topic-marker"], exclude: [], exactPhrases: [] },
      booleanQuery: "emerging-topic-marker",
      sourceTypes: ["news"],
    });
    const topicRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: topicQuery.id,
      createdByUserId: userId,
      name: "Emerging topic rule",
      type: "emerging_topic",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    const [topic] = await db
      .insert(schema.topics)
      .values({ name: `Product Recall ${Date.now()}` })
      .returning();
    if (!topic) throw new Error("failed to create test topic");

    // Baseline: 1 mention/day for the trailing week (~1/day baseline).
    for (let daysAgo = 7; daysAgo >= 2; daysAgo -= 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://emerging-topic-test.example/baseline-${daysAgo}`,
          contentHash: `emerging-topic-baseline-${daysAgo}`,
          title: `emerging-topic-marker baseline item ${daysAgo}`,
        })
        .returning();
      if (!article) throw new Error("failed to create baseline article");
      const [mention] = await db
        .insert(schema.mentions)
        .values({
          organizationId,
          projectId,
          queryId: topicQuery.id,
          articleId: article.id,
          matchedTerms: ["emerging-topic-marker"],
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        })
        .returning();
      if (!mention) throw new Error("failed to create baseline mention");
      await db.insert(schema.mentionTopics).values({
        mentionId: mention.id,
        topicId: topic.id,
        confidence: "0.900",
      });
    }

    // Current window: 8 mentions on the same topic in the last few hours —
    // well over both the MIN_ABSOLUTE_COUNT floor and 3x the ~1/day baseline.
    for (let i = 0; i < 8; i += 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://emerging-topic-test.example/current-${i}`,
          contentHash: `emerging-topic-current-${i}`,
          title: `emerging-topic-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create current article");
      const [mention] = await db
        .insert(schema.mentions)
        .values({
          organizationId,
          projectId,
          queryId: topicQuery.id,
          articleId: article.id,
          matchedTerms: ["emerging-topic-marker"],
        })
        .returning();
      if (!mention) throw new Error("failed to create current mention");
      await db.insert(schema.mentionTopics).values({
        mentionId: mention.id,
        topicId: topic.id,
        confidence: "0.900",
      });
    }

    await evaluateEmergingTopicAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    const topicNotification = notifications.find((n) => n.title === topicRule.name);
    expect(topicNotification).toBeDefined();
    expect(topicNotification?.body).toContain(topic.name);
  });

  it("does not fire an emerging-topic alert below the minimum absolute-count floor", async () => {
    const quietTopicQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Emerging topic quiet query",
      queryAst: {
        include: ["emerging-topic-quiet-marker"],
        exclude: [],
        exactPhrases: [],
      },
      booleanQuery: "emerging-topic-quiet-marker",
      sourceTypes: ["news"],
    });
    const quietTopicRule = await createAlertRule(db, organizationId, {
      projectId,
      queryId: quietTopicQuery.id,
      createdByUserId: userId,
      name: "Emerging topic quiet rule",
      type: "emerging_topic",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    const [topic] = await db
      .insert(schema.topics)
      .values({ name: `Quiet Topic ${Date.now()}` })
      .returning();
    if (!topic) throw new Error("failed to create test topic");

    // Only 2 mentions on this topic, brand new — below MIN_ABSOLUTE_COUNT (3).
    for (let i = 0; i < 2; i += 1) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://emerging-topic-quiet.example/current-${i}`,
          contentHash: `emerging-topic-quiet-current-${i}`,
          title: `emerging-topic-quiet-marker current item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create current article");
      const [mention] = await db
        .insert(schema.mentions)
        .values({
          organizationId,
          projectId,
          queryId: quietTopicQuery.id,
          articleId: article.id,
          matchedTerms: ["emerging-topic-quiet-marker"],
        })
        .returning();
      if (!mention) throw new Error("failed to create current mention");
      await db.insert(schema.mentionTopics).values({
        mentionId: mention.id,
        topicId: topic.id,
        confidence: "0.900",
      });
    }

    await evaluateEmergingTopicAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 50,
    });
    expect(notifications.some((n) => n.title === quietTopicRule.name)).toBe(false);
  });

  async function seedMentions(
    forProjectId: string,
    queryId: string,
    count: number,
    urlPrefix: string,
  ) {
    for (let i = 0; i < count; i++) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://${urlPrefix}.example/${i}`,
          contentHash: `${urlPrefix}-${i}`,
          title: `${urlPrefix} item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId: forProjectId,
        queryId,
        articleId: article.id,
        matchedTerms: [urlPrefix],
      });
    }
  }

  it("fires a competitor alert when the competitor query outpaces the project's company queries", async () => {
    // A dedicated project, not this file's shared `projectId` — the
    // stats query sums every "company"-tagged query in the project, and
    // every query created without an explicit trackingTarget elsewhere
    // in this file defaults to "company" (packages/db/src/schema/
    // monitoring.ts), so sharing the project would pull in unrelated
    // tests' mention counts.
    const project = await createProject(db, organizationId, {
      workspaceId,
      name: "Competitor Alert Test Project (outpacing)",
    });
    const companyQuery = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Competitor-alert company query",
      queryAst: { include: ["competitor-alert-company"], exclude: [], exactPhrases: [] },
      booleanQuery: "competitor-alert-company",
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const competitorQuery = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Rival Corp",
      queryAst: { include: ["competitor-alert-rival"], exclude: [], exactPhrases: [] },
      booleanQuery: "competitor-alert-rival",
      sourceTypes: ["news"],
      trackingTarget: "competitor",
    });
    const competitorRule = await createAlertRule(db, organizationId, {
      projectId: project.id,
      queryId: competitorQuery.id,
      createdByUserId: userId,
      name: "Competitor outpacing rule",
      type: "competitor",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    await seedMentions(project.id, companyQuery.id, 2, "competitor-alert-company-mention");
    await seedMentions(project.id, competitorQuery.id, 5, "competitor-alert-rival-mention");

    await evaluateCompetitorAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, { limit: 50 });
    const notification = notifications.find((n) => n.title === competitorRule.name);
    expect(notification).toBeDefined();
    expect(notification?.body).toMatch(/Rival Corp.*5 mentions.*2/i);
  });

  it("does not fire a competitor alert when the competitor query has fewer mentions than the company queries", async () => {
    const project = await createProject(db, organizationId, {
      workspaceId,
      name: "Competitor Alert Test Project (quiet)",
    });
    const companyQuery = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Competitor-alert quiet company query",
      queryAst: { include: ["competitor-alert-quiet-company"], exclude: [], exactPhrases: [] },
      booleanQuery: "competitor-alert-quiet-company",
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const competitorQuery = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Quiet Rival Co",
      queryAst: { include: ["competitor-alert-quiet-rival"], exclude: [], exactPhrases: [] },
      booleanQuery: "competitor-alert-quiet-rival",
      sourceTypes: ["news"],
      trackingTarget: "competitor",
    });
    const quietRule = await createAlertRule(db, organizationId, {
      projectId: project.id,
      queryId: competitorQuery.id,
      createdByUserId: userId,
      name: "Competitor quiet rule",
      type: "competitor",
      channels: ["in_app"],
      cooldownMinutes: 60,
    });

    await seedMentions(project.id, companyQuery.id, 10, "competitor-alert-quiet-company-mention");
    await seedMentions(project.id, competitorQuery.id, 4, "competitor-alert-quiet-rival-mention");

    await evaluateCompetitorAlerts(emailQueue);

    const notifications = await listNotifications(db, organizationId, userId, { limit: 50 });
    expect(notifications.some((n) => n.title === quietRule.name)).toBe(false);
  });
});
