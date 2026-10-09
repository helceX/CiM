import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../client";
import { archiveRuns } from "../schema/archive";
import { emailVerificationTokens, passwordResetTokens, sessions } from "../schema/auth";
import { articles, mentions, sources } from "../schema/content";
import { erasureLog } from "../schema/compliance";
import { organizations, users, workspaces } from "../schema/index";
import { insertArticle } from "./articles";
import { createMentionIfNotExists } from "./mentions";
import { createMonitoringQuery } from "./monitoring-queries";
import { createProject } from "./projects";
import { asOrganizationId } from "./tenant-scope";
import { deleteExpiredAuthRecords, eraseOrganization, listArchiveObjectKeys, listOrganizationsDueForErasure } from "./privacy-purge";

const tag = `purge-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

async function makeOrg(label: string, deletedDaysAgo: number | null) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${label} Co`, slug: `${tag}-${label}`, ...(deletedDaysAgo === null ? {} : { deletedAt: daysAgo(deletedDaysAgo) }) })
    .returning();
  const organizationId = asOrganizationId(org!.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "W" }).returning();
  const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: `${label} P` });
  return { organizationId, projectId: project.id };
}

async function addMentions(org: Awaited<ReturnType<typeof makeOrg>>, count: number) {
  const brand = `Erasecorp${tag.replace(/\W/g, "")}`;
  const query = await createMonitoringQuery(db, org.organizationId, {
    projectId: org.projectId,
    name: "Watch",
    queryAst: { include: [brand], exclude: [], exactPhrases: [] },
    booleanQuery: brand,
    sourceTypes: ["news"],
  });
  const [source] = await db
    .insert(sources)
    .values({ name: `${tag}-src-${org.organizationId}`, domain: `${tag}-${org.organizationId}.example`, type: "news", connector: "mock", status: "healthy" })
    .returning();
  for (let i = 0; i < count; i += 1) {
    const article = await insertArticle(db, {
      sourceId: source!.id,
      canonicalUrl: `https://${tag}.example/${org.organizationId}/${i}`,
      contentHash: `${tag}-${org.organizationId}-${i}`,
      title: `${brand} story ${i}`,
      storedExcerpt: null,
      language: "en",
      publishedAt: new Date(),
      authorName: null,
      wordFingerprint: null,
    });
    await createMentionIfNotExists(db, org.organizationId, { projectId: org.projectId, queryId: query.id, articleId: article.id, matchedTerms: [brand] });
  }
}

const mentionCount = async (organizationId: string) =>
  (await db.select({ id: mentions.id }).from(mentions).where(eq(mentions.organizationId, organizationId))).length;
const orgExists = async (organizationId: string) =>
  (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId))).length === 1;

describe("erasing organizations (integration)", () => {
  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    await db.delete(sources).where(like(sources.name, `${tag}%`));
    await db.delete(articles).where(like(articles.title, `Erasecorp${tag.replace(/\W/g, "")}%`));
    await db.delete(users).where(like(users.email, `${tag}-%`));
  });

  it("lists only organizations deleted before the cutoff, oldest first", async () => {
    const old = await makeOrg("old", 45);
    const older = await makeOrg("older", 60);
    const recent = await makeOrg("recent", 5);
    const live = await makeOrg("live", null);
    const due = await listOrganizationsDueForErasure(db, daysAgo(30), 1000);
    expect(due).toContain(old.organizationId);
    expect(due).toContain(older.organizationId);
    expect(due).not.toContain(recent.organizationId);
    expect(due).not.toContain(live.organizationId);
    expect(due.indexOf(older.organizationId)).toBeLessThan(due.indexOf(old.organizationId));
    expect(await listOrganizationsDueForErasure(db, daysAgo(30), 0)).toEqual([]);
  });

  it("erases a deleted organization with everything in it, leaves others alone, and records it", async () => {
    const gone = await makeOrg("gone", 40);
    const kept = await makeOrg("kept", null);
    await addMentions(gone, 3);
    await addMentions(kept, 2);
    expect(await mentionCount(gone.organizationId)).toBe(3);

    // A batch size of 2 makes the batching run more than once.
    const result = await eraseOrganization(db, gone.organizationId, { batchSize: 2, archiveFiles: 4 });
    expect(result).toEqual({ mentions: 3 });
    expect(await orgExists(gone.organizationId)).toBe(false);
    expect(await mentionCount(gone.organizationId)).toBe(0);
    expect((await db.select().from(workspaces).where(eq(workspaces.organizationId, gone.organizationId))).length).toBe(0);

    expect(await orgExists(kept.organizationId)).toBe(true);
    expect(await mentionCount(kept.organizationId)).toBe(2);

    const [entry] = await db.select().from(erasureLog).where(eq(erasureLog.subjectId, gone.organizationId));
    expect(entry).toMatchObject({ kind: "organization_erased", detail: { mentions: 3, archiveFiles: 4 } });

    // Already gone: nothing to do, nothing logged twice.
    expect(await eraseOrganization(db, gone.organizationId)).toBeNull();
    expect((await db.select().from(erasureLog).where(eq(erasureLog.subjectId, gone.organizationId))).length).toBe(1);
  });

  it("refuses to erase an organization that was never deleted", async () => {
    const live = await makeOrg("refuse", null);
    await expect(eraseOrganization(db, live.organizationId)).rejects.toThrow(/not been deleted/);
    expect(await orgExists(live.organizationId)).toBe(true);
  });

  it("lists the archive files an organization has in object storage", async () => {
    const org = await makeOrg("archive", 40);
    const file = (key: string) => ({ name: key, key, bytes: 10, contentType: "text/html" });
    await db.insert(archiveRuns).values([
      { organizationId: org.organizationId, periodStart: "2026-01-05", periodEnd: "2026-01-11", status: "ready", files: [file("a/1.html"), file("a/1.xlsx")] },
      { organizationId: org.organizationId, periodStart: "2026-01-12", periodEnd: "2026-01-18", status: "ready", files: [file("a/2.html"), file("a/1.html")] },
    ]);
    expect((await listArchiveObjectKeys(db, org.organizationId)).sort()).toEqual(["a/1.html", "a/1.xlsx", "a/2.html"]);
    expect(await listArchiveObjectKeys(db, (await makeOrg("none", null)).organizationId)).toEqual([]);
  });
});

describe("expired sign-in records (integration)", () => {
  it("removes sessions and one-time tokens 30 days after they ended, and nothing that is still in use", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${tag}-auth@example.com`, passwordHash: "x", firstName: "A", lastName: "B", emailVerifiedAt: new Date() })
      .returning();
    const userId = user!.id;
    const cutoff = daysAgo(30);

    const session = async (expiresDaysAgo: number, revokedDaysAgo?: number) =>
      (
        await db
          .insert(sessions)
          .values({
            userId,
            expiresAt: expiresDaysAgo >= 0 ? daysAgo(expiresDaysAgo) : new Date(Date.now() - expiresDaysAgo * DAY),
            ipAddress: "203.0.113.7",
            ...(revokedDaysAgo === undefined ? {} : { revokedAt: daysAgo(revokedDaysAgo) }),
          })
          .returning()
      )[0]!.id;
    const longExpired = await session(45);
    const justExpired = await session(10);
    const active = await session(-20); // expires in 20 days
    const longRevoked = await session(-20, 40); // would still be valid, but was revoked 40 days ago
    const justRevoked = await session(-20, 3);

    const token = async (expiresDaysAgo: number, consumedDaysAgo?: number) => ({
      userId,
      tokenHash: `${tag}-${Math.random()}`,
      expiresAt: expiresDaysAgo >= 0 ? daysAgo(expiresDaysAgo) : new Date(Date.now() - expiresDaysAgo * DAY),
      ...(consumedDaysAgo === undefined ? {} : { consumedAt: daysAgo(consumedDaysAgo) }),
    });
    const [oldVerification] = await db.insert(emailVerificationTokens).values(await token(50)).returning();
    const [freshVerification] = await db.insert(emailVerificationTokens).values(await token(-1)).returning();
    const [usedReset] = await db.insert(passwordResetTokens).values(await token(-1, 35)).returning();
    const [recentReset] = await db.insert(passwordResetTokens).values(await token(-1, 2)).returning();

    const removed = await deleteExpiredAuthRecords(db, cutoff);
    expect(removed.sessions).toBeGreaterThanOrEqual(2);
    expect(removed.tokens).toBeGreaterThanOrEqual(2);

    const remaining = new Set((await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).map((row) => row.id));
    expect(remaining.has(longExpired)).toBe(false);
    expect(remaining.has(longRevoked)).toBe(false);
    expect(remaining.has(justExpired)).toBe(true);
    expect(remaining.has(active)).toBe(true);
    expect(remaining.has(justRevoked)).toBe(true);

    const verifications = new Set((await db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId))).map((row) => row.id));
    expect(verifications.has(oldVerification!.id)).toBe(false);
    expect(verifications.has(freshVerification!.id)).toBe(true);
    const resets = new Set((await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId))).map((row) => row.id));
    expect(resets.has(usedReset!.id)).toBe(false);
    expect(resets.has(recentReset!.id)).toBe(true);

    await db.delete(users).where(eq(users.id, userId));
  });
});
