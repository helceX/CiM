import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { asOrganizationId, createMentionIfNotExists, createMonitoringQuery, createProject, db, schema } from "@cim/db";
import { archiveDeleteAfterDays, processWeeklyArchiveJob } from "./weekly-archive";

const stamp = Date.now();
const env = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" };
// Monday 5 Oct 2026, 07:00 in Türkiye → the week to archive is 28 Sep – 4 Oct (2026-W40)
const monday = new Date("2026-10-05T04:00:00Z");

function fakeStore() {
  const objects = new Map<string, number>();
  return {
    objects,
    put: vi.fn(async (key: string, body: string | Uint8Array) => {
      objects.set(key, typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength);
    }),
    head: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
    delete: vi.fn(async (key: string) => void objects.delete(key)),
  };
}
const fakeQueue = () => ({ add: vi.fn(async () => ({})) }) as never;

describe("processWeeklyArchiveJob (integration)", () => {
  let orgId: string;
  let sourceId: string;
  const ownerEmail = `owner-${stamp}@example.com`;

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: `Archive Co ${stamp}`, slug: `archive-${stamp}` }).returning();
    orgId = org!.id;
    const organizationId = asOrganizationId(orgId);
    const [ws] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: ws!.id, name: "P" });
    const [user] = await db.insert(schema.users).values({ email: ownerEmail, passwordHash: "x", firstName: "O", lastName: "W", isPlatformSuperAdmin: false } as never).returning();
    await db.insert(schema.organizationMemberships).values({ organizationId, userId: user!.id, role: "organization_owner", status: "active" });
    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Zorlu",
      queryAst: { include: ["Zorlu"], exclude: [], exactPhrases: [] },
      booleanQuery: "Zorlu",
      sourceTypes: ["news"],
    });
    const [source] = await db.insert(schema.sources).values({ name: `Arch Wire ${stamp}`, domain: `arch-${stamp}.example`, type: "news", connector: "mock", canDisplayExcerpt: true }).returning();
    sourceId = source!.id;
    const inWeek = new Date("2026-09-30T10:00:00Z");
    const outside = new Date("2026-10-06T10:00:00Z");
    const rows = await db
      .insert(schema.articles)
      .values([
        { sourceId, canonicalUrl: `https://arch.example/${stamp}/1`, contentHash: `ar-${stamp}-1`, title: "Zorlu yatırım duyurdu", storedExcerpt: "Kısa özet", publishedAt: inWeek },
        { sourceId, canonicalUrl: `https://arch.example/${stamp}/2`, contentHash: `ar-${stamp}-2`, title: "Zorlu başka haber", publishedAt: inWeek },
        { sourceId, canonicalUrl: `https://arch.example/${stamp}/3`, contentHash: `ar-${stamp}-3`, title: "Zorlu sonraki hafta", publishedAt: outside },
      ])
      .returning();
    for (const article of rows) {
      await createMentionIfNotExists(db, organizationId, { projectId: project.id, queryId: query.id, articleId: article.id, matchedTerms: ["Zorlu"] });
    }
  });

  afterAll(async () => {
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await db.delete(schema.users).where(eq(schema.users.email, ownerEmail));
  });

  it("builds, stores and verifies the week's archive once, and emails the owner", async () => {
    const store = fakeStore();
    const queue = fakeQueue();
    const first = await processWeeklyArchiveJob({ env, store, now: () => monday, emailQueue: queue, appUrl: "https://app.test" });
    expect(first.failed).toBe(0);
    expect(first.built).toBeGreaterThanOrEqual(1);

    const [run] = await db.select().from(schema.archiveRuns).where(eq(schema.archiveRuns.organizationId, orgId));
    expect(run).toMatchObject({ status: "ready", periodStart: "2026-09-28", periodEnd: "2026-10-04", mentionCount: 2, truncated: false });
    expect(run!.files.map((f) => f.name).sort()).toEqual(["archive.html", "mentions.xlsx"]);
    expect(run!.emailedAt).not.toBeNull();
    for (const file of run!.files) expect(store.objects.get(file.key)).toBe(file.bytes);
    expect(run!.files[0]!.key).toContain(`orgs/${orgId}/weekly/2026-W40/`);

    const [email] = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, ownerEmail));
    expect(email?.kind).toBe("archive");
    expect(email?.bodyText).toContain("https://app.test/archive");

    const again = await processWeeklyArchiveJob({ env, store, now: () => monday, emailQueue: queue });
    const runs = await db.select().from(schema.archiveRuns).where(eq(schema.archiveRuns.organizationId, orgId));
    expect(runs).toHaveLength(1); // nothing new for this organization
    expect(again.failed).toBe(0);
  });

  it("does nothing, and says why, when object storage is not configured", async () => {
    const result = await processWeeklyArchiveJob({ env: {}, now: () => monday });
    expect(result.built).toBe(0);
    expect(result.note).toMatch(/not configured/);
  });

  it("deletes an archived week's mentions only when the stored files verify", async () => {
    const store = fakeStore();
    await processWeeklyArchiveJob({ env, store, now: () => monday }); // already built by the first test — nothing new
    const later = new Date("2026-11-20T04:00:00Z");
    const deleteEnv = { ...env, ARCHIVE_DELETE_AFTER_DAYS: "28" };
    const countMentions = async () => (await db.select().from(schema.mentions).where(eq(schema.mentions.organizationId, orgId))).length;
    expect(await countMentions()).toBe(3);

    // The archive file vanished from storage → nothing may be deleted.
    const [run] = await db.select().from(schema.archiveRuns).where(eq(schema.archiveRuns.organizationId, orgId));
    for (const file of run!.files) store.objects.set(file.key, file.bytes); // what the first test stored
    store.objects.delete(run!.files[0]!.key);
    await processWeeklyArchiveJob({ env: deleteEnv, store, now: () => later });
    expect(await countMentions()).toBe(3);

    // Restore it → the week (2 mentions) goes, the later week's mention stays.
    store.objects.set(run!.files[0]!.key, run!.files[0]!.bytes);
    await processWeeklyArchiveJob({ env: deleteEnv, store, now: () => later });
    expect(await countMentions()).toBe(1);
    const [after] = await db.select().from(schema.archiveRuns).where(eq(schema.archiveRuns.id, run!.id));
    expect(after!.deletedAt).not.toBeNull();
  });

  it("archiveDeleteAfterDays ignores nonsense and anything under four weeks", () => {
    expect(archiveDeleteAfterDays({})).toBeNull();
    expect(archiveDeleteAfterDays({ ARCHIVE_DELETE_AFTER_DAYS: "7" })).toBeNull();
    expect(archiveDeleteAfterDays({ ARCHIVE_DELETE_AFTER_DAYS: "abc" })).toBeNull();
    expect(archiveDeleteAfterDays({ ARCHIVE_DELETE_AFTER_DAYS: "90" })).toBe(90);
  });
});
