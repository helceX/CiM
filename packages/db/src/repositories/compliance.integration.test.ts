import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import { blockedDomains, takedownRequests } from "../schema/compliance";
import { users } from "../schema/users";
import {
  blockDomain,
  closeTakedownRequest,
  countOpenTakedownRequests,
  createTakedownRequest,
  isHostBlocked,
  listBlockedDomains,
  unblockDomain,
} from "./compliance";
import { createSource, setSourceCrawlEnabled } from "./sources";

describe("publisher compliance (integration)", () => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const domain = `pub-${unique}.example`;
  const requestIds: string[] = [];
  const sourceIds: string[] = [];
  let adminId: string;

  afterAll(async () => {
    if (sourceIds.length) await db.delete(sources).where(inArray(sources.id, sourceIds));
    await db.delete(blockedDomains).where(eq(blockedDomains.domain, domain));
    if (requestIds.length) await db.delete(takedownRequests).where(inArray(takedownRequests.id, requestIds));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
  });

  async function makeAdmin() {
    const [user] = await db
      .insert(users)
      .values({ email: `compliance-${unique}@example.com`, passwordHash: "x", firstName: "A", lastName: "B" })
      .returning({ id: users.id });
    adminId = user!.id;
  }

  const feed = (path: string) => ({
    name: "Pub",
    url: `https://www.${domain}${path}`,
    connector: "rss" as const,
    type: "news",
    language: "tr",
    country: "TR",
  });

  it("refuses licence-required agencies unless the admin confirms a licence", async () => {
    const input = { ...feed("/x"), url: `https://www.aa.com.tr/rss-${unique}.xml` };
    expect(await createSource(db, input)).toEqual({ ok: false, reason: "license_required" });
    const confirmed = await createSource(db, { ...input, licenseConfirmed: true });
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) sourceIds.push(confirmed.id);
  });

  it("blocking a domain pauses its sources, purges stored articles, and bars re-adding or resuming", async () => {
    await makeAdmin();
    const created = await createSource(db, feed("/rss.xml"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    sourceIds.push(created.id);
    await db.insert(articles).values({
      sourceId: created.id,
      canonicalUrl: `https://${domain}/a-${unique}`,
      contentHash: `h-${unique}`,
      title: "Stored",
    });

    const result = await blockDomain(db, { domain: `WWW.${domain}`, reason: "publisher request", userId: adminId, purge: true });
    expect(result).toEqual({ domain, sourcesPaused: 1, articlesDeleted: 1 });

    const [row] = await db.select().from(sources).where(eq(sources.id, created.id));
    expect(row?.status).toBe("unavailable");
    expect(await db.select().from(articles).where(eq(articles.sourceId, created.id))).toHaveLength(0);

    expect(await isHostBlocked(db, `news.${domain}`)).toBe(true);
    expect(await createSource(db, feed("/other.xml"))).toEqual({ ok: false, reason: "blocked" });
    expect(await setSourceCrawlEnabled(db, created.id, true)).toBe(false);

    // Idempotent.
    expect(await blockDomain(db, { domain, reason: "again", userId: adminId, purge: true })).toMatchObject({ articlesDeleted: 0 });
    expect((await listBlockedDomains(db)).filter((d) => d.domain === domain)).toHaveLength(1);
  });

  it("block without purge keeps stored articles", async () => {
    const d2 = `keep-${unique}.example`;
    const created = await createSource(db, { ...feed("/r"), url: `https://${d2}/rss` });
    if (!created.ok) throw new Error("setup");
    sourceIds.push(created.id);
    await db.insert(articles).values({ sourceId: created.id, canonicalUrl: `https://${d2}/a`, contentHash: `k-${unique}`, title: "Kept" });
    const r = await blockDomain(db, { domain: d2, reason: "r", userId: adminId, purge: false });
    expect(r.articlesDeleted).toBe(0);
    expect(await db.select().from(articles).where(eq(articles.sourceId, created.id))).toHaveLength(1);
    await db.delete(blockedDomains).where(eq(blockedDomains.domain, d2));
  });

  it("unblocking lets the domain be added again", async () => {
    const [row] = await db.select().from(blockedDomains).where(eq(blockedDomains.domain, domain));
    expect(await unblockDomain(db, row!.id)).toBe(true);
    expect(await isHostBlocked(db, domain)).toBe(false);
  });

  it("closes a takedown request once, and counts open ones", async () => {
    const before = await countOpenTakedownRequests(db);
    const id = await createTakedownRequest(db, {
      requesterName: "Editor", requesterEmail: "ed@pub.example", publisher: "Pub", targets: domain, message: "",
    });
    requestIds.push(id);
    expect(await countOpenTakedownRequests(db)).toBe(before + 1);
    expect(await closeTakedownRequest(db, id, { status: "resolved", note: "blocked", userId: adminId })).toBe(true);
    expect(await closeTakedownRequest(db, id, { status: "rejected", note: "", userId: adminId })).toBe(false);
    expect(await countOpenTakedownRequests(db)).toBe(before);
  });

  it("pauses only an exactly matched feed URL on a publisher request", async () => {
    const feedUrl = `https://${domain}/requested.xml`;
    const created = await createSource(db, { ...feed("/requested.xml"), url: feedUrl });
    if (!created.ok) throw new Error("setup");
    sourceIds.push(created.id);

    const id = await createTakedownRequest(db, {
      requesterName: "Publisher",
      requesterEmail: `owner@${domain}`,
      publisher: "Pub",
      targets: feedUrl,
      message: "Please stop polling this feed",
    });
    requestIds.push(id);
    expect(await createTakedownRequest(db, {
      requesterName: "Publisher",
      requesterEmail: `owner@${domain}`,
      publisher: "Pub",
      targets: feedUrl,
      message: "Please stop polling this feed",
    })).toBe(id);

    const [paused] = await db.select({ status: sources.status }).from(sources).where(eq(sources.id, created.id));
    expect(paused?.status).toBe("unavailable");
  });
});
