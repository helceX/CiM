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

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) — proves the alert
 * engine end to end against real Postgres: keyword alerts fire on any
 * new mention, high-relevance alerts fire only on an exact-phrase match,
 * cooldown suppresses a duplicate notification, and spike alerts fire
 * off the real statistical baseline query.
 */
describe("alert engine (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
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

    const project = await createProject(db, organizationId, {
      workspaceId: workspace.id,
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
});
