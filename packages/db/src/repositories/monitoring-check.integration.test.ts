import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { buildWordFingerprint, explainMonitoringCheck, matchableText } from "@cim/core";
import { db } from "../client";
import { alertEvents, alertRules } from "../schema/alerts";
import { articles, sources } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import { organizations, workspaces } from "../schema/index";
import { insertArticle } from "./articles";
import { createMentionIfNotExists } from "./mentions";
import { createMonitoringQuery } from "./monitoring-queries";
import { getMonitoringCheck } from "./monitoring-check";
import { createProject } from "./projects";
import { asOrganizationId } from "./tenant-scope";

const tag = `check-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function makeOrg(label: string) {
  const [org] = await db.insert(organizations).values({ name: `${label} Co`, slug: `${tag}-${label}` }).returning();
  const organizationId = asOrganizationId(org!.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "W" }).returning();
  const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: `${label} P` });
  return { organizationId, projectId: project.id };
}

const HOUR = 3_600_000;

describe("monitoring check (integration)", () => {
  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    await db.delete(sources).where(like(sources.name, `${tag}%`));
  });

  it("measures what a monitoring can read and collect, and finds a matching story it does not hold", async () => {
    const org = await makeOrg("a");
    const other = await makeOrg("b");
    const stamp = Date.now();
    const rare = `Rarecorp${stamp}`;
    const common = `Commoncorp${stamp}`;
    const ghost = `Ghostcorp${stamp}`;

    const mkSource = async (key: string, type: string, country: string | null, status = "healthy") => {
      const [source] = await db
        .insert(sources)
        .values({ name: `${tag}-${key}`, domain: `${tag}-${key}.example`, type, connector: "mock", country, status, lastCheckedAt: new Date() })
        .returning();
      return source!;
    };
    const trNews = await mkSource("tr-news", "news", "TR");
    const deNews = await mkSource("de-news", "news", "DE");
    await mkSource("global-news", "news", null);
    const trForum = await mkSource("tr-forum", "forum", "TR");
    await mkSource("dead", "news", "TR", "unavailable");

    const monitoring = (name: string, term: string, regionScopes: string[] = []) =>
      createMonitoringQuery(db, org.organizationId, {
        projectId: org.projectId,
        name,
        queryAst: { include: [term], exclude: [], exactPhrases: [] },
        booleanQuery: term,
        sourceTypes: ["news"],
        regionScopes,
      });
    const rareQuery = await monitoring("Rare watch", rare);
    const localQuery = await monitoring("Common watch (Türkiye)", common, ["TR"]);
    const ghostQuery = await monitoring("Ghost watch", ghost);
    // Saved days ago, so that the stories below were collected after the monitoring was saved.
    await db
      .update(monitoringQueries)
      .set({ createdAt: new Date(Date.now() - 5 * 24 * HOUR), updatedAt: new Date(Date.now() - 5 * 24 * HOUR) })
      .where(like(monitoringQueries.name, "% watch%"));

    let n = 0;
    async function story(sourceId: string, title: string, hoursAgo: number) {
      n += 1;
      const article = await insertArticle(db, {
        sourceId,
        canonicalUrl: `https://${tag}.example/${n}`,
        contentHash: `${tag}-${n}`,
        title,
        storedExcerpt: "",
        language: "en",
        publishedAt: null,
        authorName: null,
        wordFingerprint: buildWordFingerprint(matchableText({ title })),
      });
      await db.update(articles).set({ fetchedAt: new Date(Date.now() - hoursAgo * HOUR) }).where(eq(articles.id, article.id));
      return article;
    }
    const hold = (organizationId: ReturnType<typeof asOrganizationId>, projectId: string, queryId: string, articleId: string, term: string) =>
      createMentionIfNotExists(db, organizationId, { projectId, queryId, articleId, matchedTerms: [term] });

    const opens = await story(trNews.id, `${rare} opens a plant`, 1);
    const hires = await story(deNews.id, `${rare} hires a chief`, 2); // matches the rare monitoring — and is NOT held
    const older = await story(trNews.id, `${rare} long ago`, 30);
    await story(trForum.id, `${rare} forum thread`, 1); // a forum: not a source type the monitoring reads
    const raises = await story(trNews.id, `${common} raises money`, 3);
    await story(deNews.id, `${common} abroad`, 3); // outside the Türkiye-only monitoring's region

    await hold(org.organizationId, org.projectId, rareQuery.id, opens.id, rare);
    await hold(org.organizationId, org.projectId, rareQuery.id, older.id, rare);
    await hold(org.organizationId, org.projectId, localQuery.id, raises.id, common);
    // Notifications come from alert rules, one set per monitoring: the Türkiye monitoring has an active rule that fired,
    // the ghost one only a paused rule, the rare one none.
    const [localRule] = await db
      .insert(alertRules)
      .values({ organizationId: org.organizationId, projectId: org.projectId, queryId: localQuery.id, name: "Local rule", type: "keyword", channels: ["in_app"] })
      .returning();
    await db.insert(alertRules).values({ organizationId: org.organizationId, projectId: org.projectId, queryId: ghostQuery.id, name: "Paused rule", type: "keyword", channels: ["in_app"], status: "paused" });
    await db.insert(alertEvents).values({ organizationId: org.organizationId, alertRuleId: localRule!.id, triggerSummary: "1 new mention" });
    // Another organization holding the same story must not change this organization's numbers.
    const otherQuery = await createMonitoringQuery(db, other.organizationId, {
      projectId: other.projectId,
      name: "Other",
      queryAst: { include: [rare], exclude: [], exactPhrases: [] },
      booleanQuery: rare,
      sourceTypes: ["news"],
    });
    await hold(other.organizationId, other.projectId, otherQuery.id, hires.id, rare);

    const check = (await getMonitoringCheck(db, org.organizationId, rareQuery.id))!;
    expect(check.query.name).toBe("Rare watch");
    // The dead (unavailable) source is not active; the forum is active but not readable by this monitoring.
    expect(check.sources.active).toBeGreaterThanOrEqual(4);
    expect(check.sources.inScope).toBeGreaterThanOrEqual(3);
    expect(check.sources.inScope).toBeLessThan(check.sources.active);
    expect(check.crawl.minutesSinceLastScan).toBeLessThan(5);
    expect(check.stories.last24h).toBeGreaterThanOrEqual(2);
    // Keyword counts come from stories of readable sources only: opens + hires in 24 h, plus the 30-hour-old one in 7 days.
    expect(check.keywords).toEqual([{ term: rare, last24h: 2, last7d: 3 }]);
    // Both held mentions were created just now, whenever their stories were collected.
    expect(check.mentions).toMatchObject({ last24h: 2, last7d: 2, total: 2 });
    // hires matches the monitoring's rules, was collected after it was saved, and is not held.
    expect(check.missed.count).toBe(1);
    expect(check.missed.checked).toBe(3);
    expect(check.missedSamples.map((sample) => sample.title)).toEqual([`${rare} hires a chief`]);
    expect(check.alerts).toEqual({ active: 0, total: 0 });
    expect(check.lastAlertAt).toBeNull();
    expect(explainMonitoringCheck(check).level).toBe("problem");

    // The Türkiye-only monitoring reads only Türkiye's sources and holds everything it should.
    const local = (await getMonitoringCheck(db, org.organizationId, localQuery.id))!;
    expect(local.keywords).toEqual([{ term: common, last24h: 1, last7d: 1 }]);
    expect(local.missed).toEqual({ count: 0, checked: 1 });
    expect(local.mentions.total).toBe(1);
    expect(local.alerts).toEqual({ active: 1, total: 1 });
    expect(local.lastAlertAt).toBeInstanceOf(Date);
    expect(explainMonitoringCheck(local).level).toBe("ok");

    // A name nobody has written: running normally, simply quiet.
    const quiet = (await getMonitoringCheck(db, org.organizationId, ghostQuery.id))!;
    expect(quiet.keywords).toEqual([{ term: ghost, last24h: 0, last7d: 0 }]);
    expect(quiet.mentions.total).toBe(0);
    expect(quiet.missed).toEqual({ count: 0, checked: 0 });
    expect(quiet.alerts).toEqual({ active: 0, total: 1 });
    expect(explainMonitoringCheck(quiet).level).toBe("quiet");
    expect(explainMonitoringCheck(quiet).advice.at(-1)).toContain("paused");

    // One organization cannot check another's monitoring.
    expect(await getMonitoringCheck(db, other.organizationId, rareQuery.id)).toBeNull();
  }, 30_000);

  it("reports a monitoring whose source types match no source", async () => {
    const org = await makeOrg("c");
    const query = await createMonitoringQuery(db, org.organizationId, {
      projectId: org.projectId,
      name: "Nowhere",
      queryAst: { include: ["anything"], exclude: [], exactPhrases: [] },
      booleanQuery: "anything",
      sourceTypes: ["tv-that-does-not-exist"],
    });
    const check = (await getMonitoringCheck(db, org.organizationId, query.id))!;
    expect(check.sources.inScope).toBe(0);
    expect(check.stories.last24h).toBe(0);
    expect(check.keywords).toEqual([]);
    expect(explainMonitoringCheck(check).headline).toContain("No active source matches");
  });
});
