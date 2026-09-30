import { beforeAll, describe, expect, it } from "vitest";
import { VISUAL_DIMENSIONS, VISUAL_MEASURES } from "@cim/core";
import { visualSpecSchema } from "@cim/validation";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createBrandGroup, setQueryBrandGroup } from "./brand-groups";
import {
  createSavedVisual,
  deleteSavedVisual,
  getSavedVisual,
  listPinnedVisuals,
  listSavedVisuals,
  runVisual,
  updateSavedVisual,
} from "./visuals";
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
  const project = await createProject(db, organizationId, { workspaceId: workspace.id, name: `${label} P` });
  const query = await createMonitoringQuery(db, organizationId, {
    projectId: project.id,
    name: `${label} query`,
    queryAst: { include: [label], exclude: [], exactPhrases: [] },
    booleanQuery: label,
    sourceTypes: ["news"],
  });
  return { organizationId, projectId: project.id, queryId: query.id };
}

const spec = (overrides: Record<string, unknown>) => visualSpecSchema.parse({ measure: "mentions", dimension: "sentiment", ...overrides });

describe("visual builder (integration)", () => {
  let a: Awaited<ReturnType<typeof makeOrg>>;
  let b: Awaited<ReturnType<typeof makeOrg>>;
  let newsId: string;
  let blogId: string;
  let counter = 0;

  async function addMention(
    ctx: { organizationId: ReturnType<typeof asOrganizationId>; projectId: string; queryId: string },
    sourceId: string,
    sentiment: "positive" | "neutral" | "negative" | null,
    priority = "normal",
    createdAt: Date = new Date(),
  ) {
    counter += 1;
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://vis-test.example/${Date.now()}-${counter}`,
        contentHash: `vis-test-${Date.now()}-${counter}-${Math.floor(Math.random() * 1e9)}`,
        title: `Story ${counter}`,
      })
      .returning();
    if (!article) throw new Error("article");
    await db.insert(mentions).values({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      queryId: ctx.queryId,
      articleId: article.id,
      matchedTerms: ["x"],
      sentiment,
      priority,
      createdAt,
    });
  }

  beforeAll(async () => {
    a = await makeOrg("vis-a");
    b = await makeOrg("vis-b");
    const make = async (name: string, type: string) => {
      const [source] = await db
        .insert(sources)
        .values({ name, domain: `${name}-${Date.now()}.example`, type, connector: "mock", canDisplayExcerpt: true })
        .returning();
      if (!source) throw new Error("source");
      return source.id;
    };
    newsId = await make("Vis Wire", "news");
    blogId = await make("Vis Blog", "blog");

    // Org A: 3 news (2 negative, 1 positive critical) + 1 blog (neutral) + 1 unclassified, all today;
    // plus one old mention outside a 7-day period.
    await addMention(a, newsId, "negative");
    await addMention(a, newsId, "negative", "high");
    await addMention(a, newsId, "positive", "critical");
    await addMention(a, blogId, "neutral");
    await addMention(a, blogId, null);
    await addMention(a, newsId, "negative", "normal", new Date(Date.now() - 20 * 86_400_000));
    // Org B must never appear in A's numbers.
    await addMention(b, newsId, "negative");
    await addMention(b, newsId, "negative");
  });

  it("compiles and runs every measure × dimension without error", async () => {
    for (const measure of VISUAL_MEASURES) {
      for (const dimension of VISUAL_DIMENSIONS) {
        const result = await runVisual(db, a.organizationId, { measure, dimension, periodDays: 30 });
        expect(Array.isArray(result.rows), `${measure} × ${dimension}`).toBe(true);
      }
    }
  });

  it("counts mentions by sentiment, scoped to the organization and period", async () => {
    const { rows } = await runVisual(db, a.organizationId, spec({ periodDays: 7 }));
    expect(Object.fromEntries(rows.map((r) => [r.label, r.value]))).toEqual({
      negative: 2,
      positive: 1,
      neutral: 1,
      unclassified: 1,
    });
    const wide = await runVisual(db, a.organizationId, spec({ periodDays: 30 }));
    expect(wide.rows.find((r) => r.label === "negative")?.value).toBe(3);
  });

  it("does not leak another organization's rows, even with that organization's ids in the filters", async () => {
    const own = await runVisual(db, a.organizationId, spec({ dimension: "source_type", periodDays: 30 }));
    expect(own.rows.find((r) => r.label === "news")?.value).toBe(4);
    const spoofed = await runVisual(
      db,
      a.organizationId,
      spec({ dimension: "query", filters: { projectId: b.projectId, queryIds: [b.queryId] } }),
    );
    expect(spoofed.rows).toEqual([]);
  });

  it("computes the other measures", async () => {
    const hp = await runVisual(db, a.organizationId, spec({ measure: "high_priority", dimension: "source_type", periodDays: 7 }));
    expect(Object.fromEntries(hp.rows.map((r) => [r.label, r.value]))).toEqual({ news: 2, blog: 0 });

    const sources7 = await runVisual(db, a.organizationId, spec({ measure: "unique_sources", dimension: "query", periodDays: 7 }));
    expect(sources7.rows).toEqual([{ label: "vis-a query", value: 2 }]);

    // 2 negative of 4 classified mentions in the last 7 days = 50.0.
    const share = await runVisual(db, a.organizationId, spec({ measure: "negative_share", dimension: "query", periodDays: 7 }));
    expect(share.rows).toEqual([{ label: "vis-a query", value: 50 }]);
  });

  it("reports 0 when classified mentions exist but none are negative, and null when none are classified", async () => {
    const { rows } = await runVisual(
      db,
      a.organizationId,
      spec({ measure: "negative_share", dimension: "source", periodDays: 7, filters: { sentiments: ["neutral"] } }),
    );
    expect(rows).toEqual([{ label: "Vis Blog", value: 0 }]);

    const c = await makeOrg("vis-c");
    await addMention(c, newsId, null);
    const undefinedShare = await runVisual(db, c.organizationId, spec({ measure: "negative_share", dimension: "source_type" }));
    expect(undefinedShare.rows).toEqual([{ label: "news", value: null }]);
  });

  it("applies filters, sort and limit", async () => {
    const filtered = await runVisual(db, a.organizationId, spec({ dimension: "source", filters: { sourceTypes: ["blog"] }, periodDays: 7 }));
    expect(filtered.rows).toEqual([{ label: "Vis Blog", value: 2 }]);

    const asc = await runVisual(db, a.organizationId, spec({ sort: "value_asc", periodDays: 7 }));
    expect(asc.rows[0]?.value).toBe(1);
    const limited = await runVisual(db, a.organizationId, spec({ limit: 2, periodDays: 7 }));
    expect(limited.rows).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  it("zero-fills a day series", async () => {
    const { rows } = await runVisual(db, a.organizationId, spec({ dimension: "day", periodDays: 7 }));
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)?.value).toBe(5);
    expect(rows.slice(0, -1).every((r) => r.value === 0)).toBe(true);
  });

  it("groups by brand group, putting ungrouped queries under 'No group'", async () => {
    const before = await runVisual(db, a.organizationId, spec({ dimension: "brand_group", periodDays: 7 }));
    expect(before.rows).toEqual([{ label: "No group", value: 5 }]);
    const created = await createBrandGroup(db, a.organizationId, { projectId: a.projectId, name: "Ours", kind: "own" });
    if (!created.ok) throw new Error("group");
    await setQueryBrandGroup(db, a.organizationId, a.queryId, created.group.id);
    const after = await runVisual(db, a.organizationId, spec({ dimension: "brand_group", periodDays: 7 }));
    expect(after.rows).toEqual([{ label: "Ours", value: 5 }]);
  });

  it("re-validates a stored spec instead of trusting it", async () => {
    await expect(runVisual(db, a.organizationId, { measure: "mentions", dimension: "1; drop table mentions" })).rejects.toThrow();
    await expect(runVisual(db, a.organizationId, { measure: "mentions", dimension: "day", sql: "select 1" })).rejects.toThrow();
  });

  it("saves, lists, updates and soft-deletes visuals without crossing organizations", async () => {
    const saved = await createSavedVisual(db, a.organizationId, {
      name: "Sentiment mix",
      kind: "chart",
      spec: spec({}),
      createdBy: null,
    });
    expect((await listSavedVisuals(db, a.organizationId)).map((v) => v.id)).toContain(saved.id);

    expect(await getSavedVisual(db, b.organizationId, saved.id)).toBeUndefined();
    expect(await listSavedVisuals(db, b.organizationId)).toEqual([]);
    expect(await updateSavedVisual(db, b.organizationId, saved.id, { name: "Hijacked" })).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteSavedVisual(db, b.organizationId, saved.id)).toBe(false);
    expect((await getSavedVisual(db, a.organizationId, saved.id))?.name).toBe("Sentiment mix");

    const renamed = await updateSavedVisual(db, a.organizationId, saved.id, { name: "Renamed", kind: "table" });
    expect(renamed.ok && renamed.visual).toMatchObject({ name: "Renamed", kind: "table" });

    expect(await deleteSavedVisual(db, a.organizationId, saved.id)).toBe(true);
    expect(await getSavedVisual(db, a.organizationId, saved.id)).toBeUndefined();
    expect(await deleteSavedVisual(db, a.organizationId, saved.id)).toBe(false);
  });

  it("pins up to the limit, refuses the next one, frees a slot on unpin, and never pins across organizations", async () => {
    const c = await makeOrg("vis-pin");
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const v = await createSavedVisual(db, c.organizationId, { name: `V${i}`, kind: "chart", spec: spec({}), createdBy: null });
      ids.push(v.id);
    }
    for (const id of ids.slice(0, 4)) {
      expect((await updateSavedVisual(db, c.organizationId, id, { pinned: true })).ok).toBe(true);
    }
    expect(await updateSavedVisual(db, c.organizationId, ids[4]!, { pinned: true })).toEqual({ ok: false, reason: "pin_limit" });
    // Re-pinning an already pinned visual is not a new slot.
    expect((await updateSavedVisual(db, c.organizationId, ids[0]!, { pinned: true })).ok).toBe(true);
    expect((await listPinnedVisuals(db, c.organizationId)).map((v) => v.name)).toEqual(["V0", "V1", "V2", "V3"]);

    expect((await updateSavedVisual(db, c.organizationId, ids[1]!, { pinned: false })).ok).toBe(true);
    expect((await updateSavedVisual(db, c.organizationId, ids[4]!, { pinned: true })).ok).toBe(true);

    expect(await listPinnedVisuals(db, a.organizationId)).toEqual([]);
    expect(await updateSavedVisual(db, a.organizationId, ids[2]!, { pinned: true })).toEqual({ ok: false, reason: "not_found" });

    // Deleting a pinned visual removes it from the dashboard set.
    await deleteSavedVisual(db, c.organizationId, ids[0]!);
    expect((await listPinnedVisuals(db, c.organizationId)).map((v) => v.name)).not.toContain("V0");
  });
});
