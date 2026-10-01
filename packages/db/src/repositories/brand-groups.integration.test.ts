import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { countMentionsByQuery, createMonitoringQuery, getMonitoringQuery } from "./monitoring-queries";
import { listMentionsFiltered } from "./mentions";
import {
  createBrandGroup,
  deleteBrandGroup,
  getBrandGroupComparison,
  listBrandGroups,
  setQueryBrandGroup,
  updateBrandGroup,
} from "./brand-groups";
import { asOrganizationId } from "./tenant-scope";

async function makeOrg(label: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${label} Co`, slug: `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
    .returning();
  if (!org) throw new Error("org");
  const organizationId = asOrganizationId(org.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
  if (!workspace) throw new Error("workspace");
  const project = await createProject(db, organizationId, { workspaceId: workspace.id, name: `${label} P1` });
  const otherProject = await createProject(db, organizationId, { workspaceId: workspace.id, name: `${label} P2` });
  return { organizationId, projectId: project.id, otherProjectId: otherProject.id };
}

async function makeQuery(
  ctx: { organizationId: ReturnType<typeof asOrganizationId>; projectId: string },
  name: string,
) {
  return createMonitoringQuery(db, ctx.organizationId, {
    projectId: ctx.projectId,
    name,
    queryAst: { include: [name.toLowerCase()], exclude: [], exactPhrases: [] },
    booleanQuery: name.toLowerCase(),
    sourceTypes: ["news"],
  });
}

describe("brand groups (integration)", () => {
  let a: Awaited<ReturnType<typeof makeOrg>>;
  let b: Awaited<ReturnType<typeof makeOrg>>;
  let sourceId: string;
  let counter = 0;

  async function addMention(
    ctx: { organizationId: ReturnType<typeof asOrganizationId>; projectId: string },
    queryId: string,
    sentiment: "positive" | "neutral" | "negative",
  ) {
    counter += 1;
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://bg-test.example/${Date.now()}-${counter}`,
        contentHash: `bg-test-${Date.now()}-${counter}-${Math.floor(Math.random() * 1e9)}`,
        title: `Story ${counter}`,
      })
      .returning();
    if (!article) throw new Error("article");
    await db.insert(mentions).values({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["x"],
      sentiment,
      priority: "normal",
    });
  }

  beforeAll(async () => {
    a = await makeOrg("bgroups-a");
    b = await makeOrg("bgroups-b");
    const [source] = await db
      .insert(sources)
      .values({
        name: "BG Wire",
        domain: `bg-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("source");
    sourceId = source.id;
  });

  it("creates groups, auto-assigns distinct palette colours, and rejects a duplicate name case-insensitively", async () => {
    const first = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Our brands", kind: "own" });
    const second = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Rival Inc", kind: "competitor" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.group.color).not.toBe(second.group.color);

    const dup = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "our BRANDS", kind: "own" });
    expect(dup).toEqual({ ok: false, reason: "name_taken" });

    // The same name is fine in a different project.
    const other = await createBrandGroup(db, a.organizationId, { projectId: a.otherProjectId, name: "Our brands", kind: "own" });
    expect(other.ok).toBe(true);
  });

  it("renames and recolours a group, and reports a rename collision", async () => {
    const created = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Temp A", kind: "category" });
    const taken = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Temp B", kind: "category" });
    if (!created.ok || !taken.ok) throw new Error("setup");

    const renamed = await updateBrandGroup(db, a.organizationId, created.group.id, { name: "Temp A2", color: "violet" });
    expect(renamed.ok && renamed.group.name).toBe("Temp A2");
    expect(await updateBrandGroup(db, a.organizationId, created.group.id, { name: "temp b" })).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect(await updateBrandGroup(db, a.organizationId, "00000000-0000-4000-8000-000000000000", { name: "x" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("assigns queries, rejects cross-project and cross-tenant assignment, and can unassign", async () => {
    const group = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Assign target", kind: "own" });
    if (!group.ok) throw new Error("setup");
    const query = await makeQuery(a, "AssignQ");
    const foreignOrgQuery = await makeQuery(b, "ForeignQ");
    const otherProjectQuery = await makeQuery({ organizationId: a.organizationId, projectId: a.otherProjectId }, "OtherProjQ");

    expect(await setQueryBrandGroup(db, a.organizationId, query.id, group.group.id)).toBe("ok");
    expect((await getMonitoringQuery(db, a.organizationId, query.id))?.brandGroupId).toBe(group.group.id);

    // Another project's query can't join this project's group.
    expect(await setQueryBrandGroup(db, a.organizationId, otherProjectQuery.id, group.group.id)).toBe("project_mismatch");
    // Another tenant's query is invisible; another tenant's group is invisible.
    expect(await setQueryBrandGroup(db, a.organizationId, foreignOrgQuery.id, group.group.id)).toBe("query_not_found");
    expect(await setQueryBrandGroup(db, b.organizationId, foreignOrgQuery.id, group.group.id)).toBe("group_not_found");
    expect((await getMonitoringQuery(db, b.organizationId, foreignOrgQuery.id))?.brandGroupId).toBeNull();

    expect(await setQueryBrandGroup(db, a.organizationId, query.id, null)).toBe("ok");
    expect((await getMonitoringQuery(db, a.organizationId, query.id))?.brandGroupId).toBeNull();
  });

  it("lists only the tenant's own groups, with live query counts", async () => {
    const group = await createBrandGroup(db, b.organizationId, { projectId: b.projectId, name: "B side", kind: "own" });
    if (!group.ok) throw new Error("setup");
    const q1 = await makeQuery(b, "BQ1");
    const q2 = await makeQuery(b, "BQ2");
    await setQueryBrandGroup(db, b.organizationId, q1.id, group.group.id);
    await setQueryBrandGroup(db, b.organizationId, q2.id, group.group.id);

    const listB = await listBrandGroups(db, b.organizationId);
    expect(listB.map((g) => g.name)).toEqual(["B side"]);
    expect(listB[0]?.queryCount).toBe(2);
    expect((await listBrandGroups(db, a.organizationId)).some((g) => g.name === "B side")).toBe(false);
  });

  it("deleting a group detaches its queries and frees the name", async () => {
    const group = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Doomed", kind: "category" });
    if (!group.ok) throw new Error("setup");
    const query = await makeQuery(a, "DoomedQ");
    await setQueryBrandGroup(db, a.organizationId, query.id, group.group.id);

    expect(await deleteBrandGroup(db, b.organizationId, group.group.id)).toBe(false); // wrong tenant
    expect(await deleteBrandGroup(db, a.organizationId, group.group.id)).toBe(true);
    expect(await deleteBrandGroup(db, a.organizationId, group.group.id)).toBe(false); // already gone
    expect((await getMonitoringQuery(db, a.organizationId, query.id))?.brandGroupId).toBeNull();
    expect(await setQueryBrandGroup(db, a.organizationId, query.id, group.group.id)).toBe("group_not_found");

    const reused = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Doomed", kind: "category" });
    expect(reused.ok).toBe(true);
  });

  it("compares groups: per-group volume, sentiment, share of voice; filters mentions by group", async () => {
    const c = await makeOrg("bgroups-c");
    const own = await createBrandGroup(db, c.organizationId, { projectId: c.projectId, name: "Us", kind: "own" });
    const rival = await createBrandGroup(db, c.organizationId, { projectId: c.projectId, name: "Them", kind: "competitor" });
    const empty = await createBrandGroup(db, c.organizationId, { projectId: c.projectId, name: "Nobody", kind: "category" });
    if (!own.ok || !rival.ok || !empty.ok) throw new Error("setup");

    const usQ1 = await makeQuery(c, "UsOne");
    const usQ2 = await makeQuery(c, "UsTwo");
    const themQ = await makeQuery(c, "ThemOne");
    const ungrouped = await makeQuery(c, "Loose");
    await setQueryBrandGroup(db, c.organizationId, usQ1.id, own.group.id);
    await setQueryBrandGroup(db, c.organizationId, usQ2.id, own.group.id);
    await setQueryBrandGroup(db, c.organizationId, themQ.id, rival.group.id);

    await addMention(c, usQ1.id, "positive");
    await addMention(c, usQ1.id, "positive");
    await addMention(c, usQ2.id, "neutral");
    await addMention(c, themQ.id, "negative");
    await addMention(c, ungrouped.id, "positive"); // must not count anywhere

    const rows = await getBrandGroupComparison(db, c.organizationId, { sinceDays: 7 });
    const us = rows.find((r) => r.groupId === own.group.id);
    const them = rows.find((r) => r.groupId === rival.group.id);
    const nobody = rows.find((r) => r.groupId === empty.group.id);

    expect(us).toMatchObject({ queryCount: 2, totalMentions: 3, positive: 2, neutral: 1, negative: 0 });
    expect(them).toMatchObject({ queryCount: 1, totalMentions: 1, negative: 1 });
    expect(nobody).toMatchObject({ queryCount: 0, totalMentions: 0, shareOfVoice: 0 });
    expect(us?.shareOfVoice).toBeCloseTo(0.75);
    expect(them?.shareOfVoice).toBeCloseTo(0.25);
    // Fixed order (creation order), so colours/rows never reshuffle.
    expect(rows.map((r) => r.name)).toEqual(["Us", "Them", "Nobody"]);

    // Another tenant sees none of it.
    expect(await getBrandGroupComparison(db, a.organizationId, { projectId: c.projectId })).toEqual([]);

    const filtered = await listMentionsFiltered(db, c.organizationId, { brandGroupId: own.group.id }, { page: 1, pageSize: 50 });
    expect(filtered.totalCount).toBe(3);
    const crossTenant = await listMentionsFiltered(db, a.organizationId, { brandGroupId: own.group.id }, { page: 1, pageSize: 50 });
    expect(crossTenant.totalCount).toBe(0);

    // One query's own mentions ("View mentions" on the Monitoring list), and
    // the per-query counts that list shows.
    const oneQuery = await listMentionsFiltered(db, c.organizationId, { queryId: usQ1.id }, { page: 1, pageSize: 50 });
    expect(oneQuery.totalCount).toBe(2);
    const foreignQuery = await listMentionsFiltered(db, a.organizationId, { queryId: usQ1.id }, { page: 1, pageSize: 50 });
    expect(foreignQuery.totalCount).toBe(0);
    const counts = await countMentionsByQuery(db, c.organizationId);
    expect(counts.get(usQ1.id)).toEqual({ total: 2, last7Days: 2 });
    expect(counts.get(themQ.id)).toEqual({ total: 1, last7Days: 1 });
    expect((await countMentionsByQuery(db, a.organizationId)).get(usQ1.id)).toBeUndefined();
  });

  it("reports share of voice as null when the compared groups had no mentions", async () => {
    const d = await makeOrg("bgroups-d");
    const g1 = await createBrandGroup(db, d.organizationId, { projectId: d.projectId, name: "Quiet 1", kind: "own" });
    const g2 = await createBrandGroup(db, d.organizationId, { projectId: d.projectId, name: "Quiet 2", kind: "competitor" });
    if (!g1.ok || !g2.ok) throw new Error("setup");
    const rows = await getBrandGroupComparison(db, d.organizationId);
    expect(rows.map((r) => r.shareOfVoice)).toEqual([null, null]);
  });
});
