import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema, asOrganizationId, createProject, listMonitoringQueries, listAlertRules, getSocialOverviewStats, getTopSocialPosts } from "@cim/db";
import { ingestSource } from "../../../../../../../packages/ingestion/src/pipeline";
import { blueskySearchUrl } from "../../../../../../../packages/ingestion/src/bluesky-search-connector";
import { evaluateNewMentionAlerts } from "../../../../../../../apps/worker/src/alerts/evaluate";
import type { RawFetchResult } from "@cim/ingestion";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

const context = vi.hoisted(() => ({ userId: "", organizationId: "", permissions: ["monitoring:write", "alerts:write"] }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ id: context.userId, isPlatformSuperAdmin: false }) }));
vi.mock("@/lib/tenant", () => ({ requirePermission: async () => context }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@cim/ingestion", async (original) => {
  const actual = await original<typeof import("@cim/ingestion")>();
  return { ...actual, BlueskySearchConnector: class { async read() { return []; } } };
});
const { POST } = await import("./route");

describe("social brand setup and alert delivery (integration)", () => {
  const brand = `Lunavera${Date.now()}`;
  let projectId: string;
  let sourceIds: string[] = [];
  const organizationId = () => asOrganizationId(context.organizationId);
  beforeAll(async () => {
    const [user] = await db.insert(schema.users).values({ email: `${brand.toLowerCase()}@example.test`, passwordHash: "test-only", firstName: "Social", lastName: "Test" }).returning();
    context.userId = user!.id;
    const [org] = await db.insert(schema.organizations).values({ name: brand, slug: brand.toLowerCase() }).returning();
    context.organizationId = org!.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org!.id, userId: user!.id, role: "owner" });
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId: org!.id, name: "Default" }).returning();
    projectId = (await createProject(db, organizationId(), { workspaceId: workspace!.id, name: "Social" })).id;
  });
  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, context.organizationId));
    for (const id of sourceIds) await db.delete(schema.sources).where(eq(schema.sources.id, id));
    await db.delete(schema.users).where(eq(schema.users.id, context.userId));
  });

  it("accepts a valid zero-result search, creates one bounded source and in-app rule, and remains idempotent", async () => {
    const setup = () => POST(new Request("https://mediaory.io/api/social/setup", { method: "POST", body: JSON.stringify({ brand }), headers: { "content-type": "application/json" } }));
    const first = await setup();
    expect(first.status).toBe(200);
    const result = await first.json();
    sourceIds = result.sourceIds;
    expect(result).toMatchObject({ ok: true, sampleCount: 0, active: true });
    const second = await (await setup()).json();
    expect(second.queryId).toBe(result.queryId);
    expect(second.sourceIds).toEqual(sourceIds);
    expect(second.alertRuleId).toBe(result.alertRuleId);
    expect(await listMonitoringQueries(db, organizationId())).toHaveLength(1);
    const rules = await listAlertRules(db, organizationId());
    expect(rules).toHaveLength(1);
    expect(rules[0]?.rule.channels).toEqual(["in_app"]);
    expect(rules[0]?.rule.cooldownMinutes).toBe(60);
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceIds[0]!));
    expect(source).toMatchObject({ type: "social", connector: "bluesky-search", canProcessAi: false, canStoreFullText: false, url: blueskySearchUrl(brand) });
  });

  it("ingests an untagged brand mention, attributes its author and delivers a real in-app notification only to this organization", async () => {
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceIds[0]!));
    const raw: RawFetchResult = { externalId: "post", canonicalUrl: `https://bsky.app/profile/did:plc:testauthor/post/${brand}`, title: `${brand} has a new product`, bodyText: `I read about ${brand} today, without tagging any account.`, publishedAt: new Date(), language: "en", socialPlatform: "bluesky", socialMentionHandles: [], socialAuthorExternalId: `did:plc:${brand.toLowerCase()}`, socialAuthorHandle: `${brand.toLowerCase()}.bsky.social` };
    const result = await ingestSource(db, source!, { fetch: async () => [raw], healthCheck: async () => ({ status: "healthy" }) });
    expect(result.newMentions.some((record) => record.organizationId === context.organizationId)).toBe(true);
    await evaluateNewMentionAlerts({} as Queue<SendEmailJobData>, result.newMentions);
    const counts = await getSocialOverviewStats(db, organizationId(), { sinceDays: 7 });
    expect(counts).toMatchObject({ totalConversations: 1, directMentions: 0, uniqueAuthors: 1 });
    const [notification] = await db.select().from(schema.notifications).where(and(eq(schema.notifications.organizationId, context.organizationId), eq(schema.notifications.userId, context.userId)));
    expect(notification?.kind).toBe("alert");
    expect(notification?.title).toContain(brand);
    const [query] = await listMonitoringQueries(db, organizationId());
    const [post] = await getTopSocialPosts(db, organizationId(), { sinceDays: 7, queryId: query!.id });
    expect(post).toMatchObject({ queryName: `Sosyal takip — ${brand}`, matchType: "contextual" });
    expect(await getTopSocialPosts(db, organizationId(), { sinceDays: 7, queryId: "00000000-0000-4000-8000-000000000001" })).toEqual([]);
    expect(query?.projectId).toBe(projectId);
  });

  it("recognizes a verified account tag even when the brand name is absent", async () => {
    const [query] = await listMonitoringQueries(db, organizationId());
    const handle = `@${brand.toLowerCase()}.bsky.social`;
    await db.update(schema.monitoringQueries).set({ queryAst: { include: [handle, brand], exclude: [], exactPhrases: [] } }).where(eq(schema.monitoringQueries.id, query!.id));
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceIds[0]!));
    const raw: RawFetchResult = { externalId: "tagged", canonicalUrl: `https://bsky.app/profile/did:plc:taggedauthor/post/${brand}`, title: `${handle} when will your next event take place?`, bodyText: `${handle} when will your next event take place?`, publishedAt: new Date(), language: "en", socialPlatform: "bluesky", socialMentionHandles: [handle], socialAuthorExternalId: `did:plc:tagged${brand.toLowerCase()}`, socialAuthorHandle: `tagged${brand.toLowerCase()}.bsky.social` };
    await ingestSource(db, source!, { fetch: async () => [raw], healthCheck: async () => ({ status: "healthy" }) });
    const counts = await getSocialOverviewStats(db, organizationId(), { sinceDays: 7 });
    expect(counts).toMatchObject({ totalConversations: 2, directMentions: 1 });
    const posts = await getTopSocialPosts(db, organizationId(), { sinceDays: 7, queryId: query!.id });
    expect(posts.some((post) => post.matchType === "direct_mention" && post.matchedTerms?.includes(handle))).toBe(true);
  });
});
