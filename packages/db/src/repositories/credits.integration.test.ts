import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../client";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import {
  addLedgerEntry,
  getCreditSummary,
  getTrackedKeywordCount,
  listLedgerEntries,
  meterKeywordDay,
} from "./credits";
import { asOrganizationId } from "./tenant-scope";
import { monitoringQueries } from "../schema/monitoring";
import { eq } from "drizzle-orm";

async function makeOrg(label: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${label} Co`, slug: `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
    .returning();
  if (!org) throw new Error("org");
  const organizationId = asOrganizationId(org.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
  if (!workspace) throw new Error("workspace");
  const project = await createProject(db, organizationId, { workspaceId: workspace.id, name: `${label} P` });
  return { organizationId, projectId: project.id };
}

async function addQuery(
  ctx: { organizationId: ReturnType<typeof asOrganizationId>; projectId: string },
  name: string,
  include: string[],
  extra: { exactPhrases?: string[]; exclude?: string[] } = {},
) {
  return createMonitoringQuery(db, ctx.organizationId, {
    projectId: ctx.projectId,
    name,
    queryAst: { include, exclude: extra.exclude ?? [], exactPhrases: extra.exactPhrases ?? [] },
    booleanQuery: include.join(" OR "),
    sourceTypes: ["news"],
  });
}

describe("credit metering (integration)", () => {
  let a: Awaited<ReturnType<typeof makeOrg>>;
  let b: Awaited<ReturnType<typeof makeOrg>>;

  beforeAll(async () => {
    a = await makeOrg("credits-a");
    b = await makeOrg("credits-b");
  });

  it("counts distinct keywords across active queries only, per tenant", async () => {
    await addQuery(a, "Q1", ["Acme", "Widget"], { exclude: ["jobs"] });
    await addQuery(a, "Q2", ["acme"], { exactPhrases: ["Acme Corp"] });
    const paused = await addQuery(a, "Q3 paused", ["Secret"]);
    await db.update(monitoringQueries).set({ status: "paused" }).where(eq(monitoringQueries.id, paused.id));
    await addQuery(b, "B1", ["Other"]);

    expect(await getTrackedKeywordCount(db, a.organizationId)).toBe(3); // acme, widget, phrase "acme corp"
    expect(await getTrackedKeywordCount(db, b.organizationId)).toBe(1);
  });

  it("meters a day once: a second run is a no-op and does not double-charge", async () => {
    const first = await meterKeywordDay(db, a.organizationId, "2026-09-29");
    const second = await meterKeywordDay(db, a.organizationId, "2026-09-29");
    expect(first).toEqual({ keywords: 3, charged: true });
    expect(second).toEqual({ keywords: 3, charged: false });

    await meterKeywordDay(db, a.organizationId, "2026-09-30");
    const summary = await getCreditSummary(db, a.organizationId);
    expect(summary.usedInWindow).toBe(6);
    expect(summary.balance).toBe(-6);
    expect(summary.grantedTotal).toBe(0);
    expect(summary.averageDailyUse).toBe(3);
  });

  it("writes nothing for an organization that tracks no keywords", async () => {
    const empty = await makeOrg("credits-empty");
    expect(await meterKeywordDay(db, empty.organizationId, "2026-09-30")).toEqual({ keywords: 0, charged: false });
    const summary = await getCreditSummary(db, empty.organizationId);
    expect(summary).toMatchObject({ balance: 0, usedInWindow: 0, grantedTotal: 0, averageDailyUse: null });
  });

  it("grants raise the balance; adjustments are new rows; invalid amounts are rejected", async () => {
    await addLedgerEntry(db, a.organizationId, { kind: "grant", amount: 100, reason: "Welcome allowance" });
    await addLedgerEntry(db, a.organizationId, { kind: "adjustment", amount: -4, reason: "Correction" });
    const summary = await getCreditSummary(db, a.organizationId);
    expect(summary.grantedTotal).toBe(100);
    expect(summary.balance).toBe(100 - 6 - 4);

    await expect(addLedgerEntry(db, a.organizationId, { kind: "grant", amount: -5, reason: "x" })).rejects.toThrow();
    await expect(addLedgerEntry(db, a.organizationId, { kind: "grant", amount: 0, reason: "x" })).rejects.toThrow();
    await expect(addLedgerEntry(db, a.organizationId, { kind: "adjustment", amount: 1.5, reason: "x" })).rejects.toThrow();
  });

  it("keeps each tenant's ledger private", async () => {
    await meterKeywordDay(db, b.organizationId, "2026-09-30");
    const bSummary = await getCreditSummary(db, b.organizationId);
    expect(bSummary.usedInWindow).toBe(1);
    const aEntries = await listLedgerEntries(db, a.organizationId);
    const bEntries = await listLedgerEntries(db, b.organizationId);
    expect(aEntries.every((entry) => entry.organizationId === a.organizationId)).toBe(true);
    expect(bEntries.every((entry) => entry.organizationId === b.organizationId)).toBe(true);
    expect(bEntries.length).toBe(1);
  });
});
