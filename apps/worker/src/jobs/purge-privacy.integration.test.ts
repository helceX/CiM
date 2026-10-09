import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { asOrganizationId, db, schema } from "@cim/db";
import { processPurgePrivacyJob } from "./purge-privacy";

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const file = (key: string) => ({ name: key, key, bytes: 1, contentType: "text/html" });

async function makeOrg(label: string, deletedDaysAgo: number | null, archiveKeys: string[] = []) {
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: `${label} Co`, slug: `purge-job-${stamp}-${label}`, ...(deletedDaysAgo === null ? {} : { deletedAt: daysAgo(deletedDaysAgo) }) })
    .returning();
  const organizationId = asOrganizationId(org!.id);
  if (archiveKeys.length > 0) {
    await db.insert(schema.archiveRuns).values({
      organizationId,
      periodStart: "2026-01-05",
      periodEnd: "2026-01-11",
      status: "ready",
      files: archiveKeys.map(file),
    });
  }
  return organizationId;
}

const exists = async (id: string) => (await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, id))).length === 1;
const recorder = () => {
  const deleted: string[] = [];
  return { deleted, store: { delete: async (key: string) => void deleted.push(key) } };
};

describe("processPurgePrivacyJob (integration)", () => {
  afterAll(async () => {
    await db.delete(schema.organizations).where(like(schema.organizations.slug, `purge-job-${stamp}-%`));
    await db.delete(schema.users).where(like(schema.users.email, `purge-job-${stamp}-%`));
  });

  it("erases an organization deleted long ago with its archive files, and leaves a recently deleted or live one", async () => {
    const old = await makeOrg("old", 45, [`orgs/${stamp}/a.html`, `orgs/${stamp}/a.xlsx`]);
    const recent = await makeOrg("recent", 10, [`orgs/${stamp}/r.html`]);
    const live = await makeOrg("live", null, [`orgs/${stamp}/l.html`]);
    const { deleted, store } = recorder();

    const result = await processPurgePrivacyJob({ env: {}, store });
    expect(result.organizations).toBeGreaterThanOrEqual(1);
    expect(await exists(old)).toBe(false);
    expect(deleted).toEqual(expect.arrayContaining([`orgs/${stamp}/a.html`, `orgs/${stamp}/a.xlsx`]));
    expect(deleted).not.toContain(`orgs/${stamp}/r.html`);
    expect(deleted).not.toContain(`orgs/${stamp}/l.html`);
    expect(await exists(recent)).toBe(true);
    expect(await exists(live)).toBe(true);

    const [entry] = await db.select().from(schema.erasureLog).where(eq(schema.erasureLog.subjectId, old));
    expect(entry).toMatchObject({ kind: "organization_erased", detail: { archiveFiles: 2 } });
  });

  it("follows ORG_ERASE_DAYS", async () => {
    const tenDays = await makeOrg("tendays", 10);
    await processPurgePrivacyJob({ env: {}, store: recorder().store });
    expect(await exists(tenDays)).toBe(true);
    await processPurgePrivacyJob({ env: { ORG_ERASE_DAYS: "7" }, store: recorder().store });
    expect(await exists(tenDays)).toBe(false);
  });

  it("does not erase an organization half-way: files it cannot remove keep it for the next run", async () => {
    const withFiles = await makeOrg("nostore", 45, [`orgs/${stamp}/n.html`]);
    const noStore = await processPurgePrivacyJob({ env: {}, store: null });
    expect(noStore.skipped).toBeGreaterThanOrEqual(1);
    expect(await exists(withFiles)).toBe(true);

    const failing = await processPurgePrivacyJob({
      env: {},
      store: { delete: async () => Promise.reject(new Error("storage is down")) },
    });
    expect(failing.skipped).toBeGreaterThanOrEqual(1);
    expect(await exists(withFiles)).toBe(true);
    expect((await db.select().from(schema.erasureLog).where(eq(schema.erasureLog.subjectId, withFiles))).length).toBe(0);

    // Storage works again: it goes.
    await processPurgePrivacyJob({ env: {}, store: recorder().store });
    expect(await exists(withFiles)).toBe(false);
  });

  it("erases no more than three organizations in one run", async () => {
    const ids = [];
    for (const label of ["b1", "b2", "b3", "b4"]) ids.push(await makeOrg(label, 60));
    const first = await processPurgePrivacyJob({ env: {}, store: recorder().store });
    expect(first.organizations).toBeLessThanOrEqual(3);
    let remaining = 0;
    for (const id of ids) if (await exists(id)) remaining += 1;
    expect(remaining).toBeGreaterThanOrEqual(1);
    for (let run = 0; run < 3; run += 1) await processPurgePrivacyJob({ env: {}, store: recorder().store });
    for (const id of ids) expect(await exists(id)).toBe(false);
  });

  it("also clears out sessions that ended more than 30 days ago", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `purge-job-${stamp}-u@example.com`, passwordHash: "x", firstName: "A", lastName: "B", emailVerifiedAt: new Date() })
      .returning();
    const [oldSession] = await db.insert(schema.sessions).values({ userId: user!.id, expiresAt: daysAgo(40) }).returning();
    const [liveSession] = await db.insert(schema.sessions).values({ userId: user!.id, expiresAt: new Date(Date.now() + 5 * DAY) }).returning();
    const result = await processPurgePrivacyJob({ env: {}, store: recorder().store });
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    const left = (await db.select({ id: schema.sessions.id }).from(schema.sessions).where(eq(schema.sessions.userId, user!.id))).map((row) => row.id);
    expect(left).toEqual([liveSession!.id]);
    expect(left).not.toContain(oldSession!.id);
  });
});
