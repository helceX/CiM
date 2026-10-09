import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { alertEvents } from "../schema/alerts";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/organizations";
import { users } from "../schema/users";
import { createAlertRule, listRuleIdsInCooldown } from "./alerts";
import {
  getQueryIdsWithClassifiedMentions,
  getQueryIdsWithCreatorPosts,
  getQueryIdsWithCurrentHourMentions,
  getQueryIdsWithRecentMentions,
  getQueryIdsWithTopicVolume,
  getQuerySentimentShiftStats,
  getQuerySpikeStats,
} from "./analytics";
import { mentionTopics, topics } from "../schema/ai";
import { socialProfiles } from "../schema/social";
import { createMonitoringQuery } from "./monitoring-queries";
import { createProject } from "./projects";
import { asOrganizationId } from "./tenant-scope";

/**
 * The alert evaluators run every minute for every rule, so their statistics were rewritten to read only the last
 * hours/days of one query (docs/architecture/CRAWL_COST.md, F6). This pins the numbers: the spike statistics are
 * compared with the previous formulation of the same query on the same rows, and the pre-filters are checked against
 * the thresholds the evaluators apply themselves.
 */

/** The query as it was before the rewrite (kept here as the reference the new one must agree with). */
async function referenceSpikeStats(queryId: string) {
  const [row] = (
    await db.execute<{ current_count: number; baseline_avg: string | null; baseline_stddev: string | null }>(sql`
      with hours as (
        select generate_series(
          date_trunc('hour', now()) - interval '24 hours',
          date_trunc('hour', now()) - interval '1 hour',
          interval '1 hour'
        ) as hour
      ),
      hourly as (
        select h.hour, count(m.id) as cnt
        from hours h
        left join ${mentions} m
          on date_trunc('hour', m.created_at) = h.hour
          and m.query_id = ${queryId}
        group by h.hour
      ),
      current_hour as (
        select count(*) as cnt
        from ${mentions}
        where query_id = ${queryId}
          and created_at >= date_trunc('hour', now())
      )
      select
        (select cnt from current_hour) as current_count,
        avg(hourly.cnt) as baseline_avg,
        stddev_pop(hourly.cnt) as baseline_stddev
      from hourly
    `)
  ).rows;
  return {
    currentHourCount: Number(row?.current_count ?? 0),
    baselineAvg: Number(row?.baseline_avg ?? 0),
    baselineStdDev: Number(row?.baseline_stddev ?? 0),
  };
}

describe("alert statistics and pre-filters (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let busyQueryId: string;
  let quietQueryId: string;
  let emptyQueryId: string;
  let sourceId: string;
  let userId: string;
  const ruleIds: string[] = [];
  let topicId: string | null = null;
  let profileId: string | null = null;
  let counter = 0;

  async function addMentions(queryId: string, count: number, at: Date, sentiment: "positive" | "negative" | null) {
    for (let i = 0; i < count; i += 1) {
      counter += 1;
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://alert-stats.example/${organizationId}/${counter}`,
          contentHash: `alert-stats-${organizationId}-${counter}`,
          title: `Alert stats article ${counter}`,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      await db.insert(mentions).values({ organizationId, projectId, queryId, articleId: article.id, matchedTerms: ["test"], sentiment, createdAt: at });
    }
  }

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Alert Stats Test Co", slug: `alert-stats-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);
    const [workspace] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
    if (!workspace) throw new Error("failed to create test workspace");
    const project = await createProject(db, organizationId, { workspaceId: workspace.id, name: "Alert stats project" });
    projectId = project.id;
    const makeQuery = async (name: string) =>
      (
        await createMonitoringQuery(db, organizationId, {
          projectId,
          name,
          queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
          booleanQuery: "test",
          sourceTypes: ["news"],
        })
      ).id;
    busyQueryId = await makeQuery("Busy");
    quietQueryId = await makeQuery("Quiet");
    emptyQueryId = await makeQuery("Empty");
    const [source] = await db
      .insert(sources)
      .values({ name: "Alert stats source", domain: `alert-stats-${Date.now()}.example`, type: "news", connector: "mock" })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;
    const [user] = await db
      .insert(users)
      .values({ email: `alert-stats-${Date.now()}@example.com`, passwordHash: "not-a-real-hash", firstName: "Alert", lastName: "Stats", emailVerifiedAt: new Date() })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;

    const [{ hour }] = (await db.execute<{ hour: Date }>(sql`select date_trunc('hour', now()) as hour`)).rows as [{ hour: Date }];
    const hourStart = new Date(hour);
    const at = (hoursAgo: number) => new Date(hourStart.getTime() - hoursAgo * 3_600_000 + 10 * 60_000);

    // busy: 4 in the current hour (3 negative, 1 positive), 5 two hours ago, 1 three hours ago, 7 thirty hours ago (outside every window)
    await addMentions(busyQueryId, 3, hourStart, "negative");
    await addMentions(busyQueryId, 1, hourStart, "positive");
    await addMentions(busyQueryId, 5, at(2), null);
    await addMentions(busyQueryId, 1, at(3), "positive");
    await addMentions(busyQueryId, 7, at(30), "negative");
    // quiet: 2 in the current hour, both classified — below both floors of 3
    await addMentions(quietQueryId, 2, hourStart, "negative");
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    if (topicId) await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(sources).where(eq(sources.id, sourceId));
    if (profileId) await db.delete(socialProfiles).where(eq(socialProfiles.id, profileId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("computes the same spike statistics as the previous query, including hours with no mentions", async () => {
    const stats = await getQuerySpikeStats(db, busyQueryId);
    expect(stats.currentHourCount).toBe(4);
    // hourly counts over the 24 baseline hours: one hour of 5, one hour of 1, twenty-two empty hours
    expect(stats.baselineAvg).toBeCloseTo(6 / 24, 10);
    expect(stats.baselineStdDev).toBeCloseTo(Math.sqrt(26 / 24 - (6 / 24) ** 2), 10);
    expect(stats).toEqual(await referenceSpikeStats(busyQueryId));

    expect(await getQuerySpikeStats(db, emptyQueryId)).toEqual({ currentHourCount: 0, baselineAvg: 0, baselineStdDev: 0 });
    expect(await getQuerySpikeStats(db, quietQueryId)).toEqual(await referenceSpikeStats(quietQueryId));
  });

  it("keeps the sentiment-shift statistics the same now that the query reads only the last eight days", async () => {
    const stats = await getQuerySentimentShiftStats(db, busyQueryId);
    // classified in the last 24 h: 3 negative + 1 positive now, 1 positive three hours ago; the 5 unclassified are not counted
    expect(stats.currentClassifiedCount).toBe(5);
    expect(stats.currentNegativeShare).toBeCloseTo(3 / 5, 10);
    // the 7 mentions from 30 hours ago are the baseline (24 h .. 8 days); they are all negative
    expect(stats.baselineClassifiedCount).toBe(7);
    expect(stats.baselineNegativeShare).toBe(1);
  });

  it("names only the queries that reach the spike evaluator's floor of three mentions in this hour", async () => {
    const ids = [busyQueryId, quietQueryId, emptyQueryId, "00000000-0000-4000-8000-000000000000"];
    expect([...(await getQueryIdsWithCurrentHourMentions(db, ids, 3))]).toEqual([busyQueryId]);
    expect([...(await getQueryIdsWithCurrentHourMentions(db, ids, 2))].sort()).toEqual([busyQueryId, quietQueryId].sort());
    expect((await getQueryIdsWithCurrentHourMentions(db, [], 3)).size).toBe(0);
  });

  it("names only the queries with at least three scored mentions in the last 24 hours", async () => {
    const ids = [busyQueryId, quietQueryId, emptyQueryId];
    expect([...(await getQueryIdsWithClassifiedMentions(db, ids, 3))]).toEqual([busyQueryId]);
  });

  it("names the queries with three mentions in the last 24 hours (competitor and creator-spike floor), not those with two", async () => {
    const ids = [busyQueryId, quietQueryId, emptyQueryId];
    // busy: 4 now + 5 + 1 inside 24 h (the 7 from 30 h ago do not count)
    expect([...(await getQueryIdsWithRecentMentions(db, ids, 3))]).toEqual([busyQueryId]);
    expect([...(await getQueryIdsWithRecentMentions(db, ids, 11))]).toEqual([]);
  });

  it("names the queries where one AI topic reaches three mentions in 24 hours — none while no topics exist", async () => {
    const ids = [busyQueryId, quietQueryId];
    expect((await getQueryIdsWithTopicVolume(db, ids, 3)).size).toBe(0);

    const [topic] = await db.insert(topics).values({ name: `alert-stats-topic-${Date.now()}` }).returning();
    topicId = topic?.id ?? null;
    if (!topic) throw new Error("failed to create test topic");
    const recent = await db.select({ id: mentions.id }).from(mentions).where(eq(mentions.queryId, busyQueryId)).orderBy(sql`created_at desc`).limit(3);
    await db.insert(mentionTopics).values(recent.slice(0, 2).map((row) => ({ mentionId: row.id, topicId: topic.id, confidence: "0.900" })));
    expect((await getQueryIdsWithTopicVolume(db, ids, 3)).size).toBe(0); // two mentions carry it: below the floor
    await db.insert(mentionTopics).values({ mentionId: recent[2]!.id, topicId: topic.id, confidence: "0.900" });
    expect([...(await getQueryIdsWithTopicVolume(db, ids, 3))]).toEqual([busyQueryId]);
  });

  it("names the queries with three recent mentions whose story has a social author — none for ordinary news", async () => {
    const ids = [busyQueryId, quietQueryId];
    expect((await getQueryIdsWithCreatorPosts(db, ids, 3)).size).toBe(0);
    const [profile] = await db
      .insert(socialProfiles)
      .values({ platform: "mock", externalId: `alert-stats-${Date.now()}`, handle: "alertstats" })
      .returning();
    if (!profile) throw new Error("failed to create test social profile");
    profileId = profile.id;
    const ours = await db
      .select({ articleId: mentions.articleId })
      .from(mentions)
      .where(eq(mentions.queryId, busyQueryId))
      .orderBy(sql`created_at desc`)
      .limit(3);
    for (const row of ours.slice(0, 2)) await db.update(articles).set({ authorProfileId: profile.id }).where(eq(articles.id, row.articleId));
    expect((await getQueryIdsWithCreatorPosts(db, ids, 3)).size).toBe(0); // two creator posts: below the floor
    await db.update(articles).set({ authorProfileId: profile.id }).where(eq(articles.id, ours[2]!.articleId));
    expect([...(await getQueryIdsWithCreatorPosts(db, ids, 3))]).toEqual([busyQueryId]);
  });

  it("reports which rules are inside their own cooldown, and only those", async () => {
    const make = async (name: string, cooldownMinutes: number) => {
      const rule = await createAlertRule(db, organizationId, {
        projectId,
        queryId: busyQueryId,
        createdByUserId: userId,
        name,
        type: "spike",
        channels: ["in_app"],
        cooldownMinutes,
      });
      ruleIds.push(rule.id);
      return rule.id;
    };
    const justFired = await make("fired 5 minutes ago, cooldown 60", 60);
    const longAgo = await make("fired 2 hours ago, cooldown 60", 60);
    const shortCooldown = await make("fired 5 minutes ago, cooldown 3", 3);
    const never = await make("never fired", 60);
    const event = (alertRuleId: string, minutesAgo: number) =>
      db.insert(alertEvents).values({ organizationId, alertRuleId, triggerSummary: "t", createdAt: new Date(Date.now() - minutesAgo * 60_000) });
    await event(justFired, 5);
    await event(longAgo, 120);
    await event(shortCooldown, 5);

    const cooling = await listRuleIdsInCooldown(db, [justFired, longAgo, shortCooldown, never]);
    expect([...cooling]).toEqual([justFired]);
    expect((await listRuleIdsInCooldown(db, [])).size).toBe(0);
  });
});
