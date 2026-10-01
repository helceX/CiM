import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, createProject, createMonitoringQuery, listRecentMentions, asOrganizationId } from "@cim/db";
import { ingestSource } from "./pipeline";
import type { RawFetchResult, SourceConnector } from "./connector";

/**
 * A short abbreviation must match the WORD, not any text that contains it:
 * "THY" is THY'nin / THY ile, never ARTHYMIA. Exercised end to end — real
 * pipeline, real Postgres — because this is what customers see as mentions.
 */
class FixedTitles implements SourceConnector {
  constructor(private readonly titles: string[]) {}
  async fetch(): Promise<RawFetchResult[]> {
    return this.titles.map((title, i) => ({
      externalId: `m-${i}-${title}`,
      canonicalUrl: `https://matching.example/${encodeURIComponent(title)}`,
      title,
      bodyText: "",
      publishedAt: new Date(),
    }));
  }
  async healthCheck() {
    return { status: "healthy" as const };
  }
}

describe("keyword matching in the ingestion pipeline (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Matching Co", slug: `matching-${unique}` })
      .returning();
    organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    projectId = (await createProject(db, organizationId, { workspaceId: workspace!.id, name: "P" })).id;
    const [source] = await db
      .insert(schema.sources)
      .values({ name: "Matching Wire", domain: `matching-${unique}.example`, type: "news", connector: "mock", status: "healthy", canDisplayExcerpt: true })
      .returning();
    sourceId = source!.id;
    const query = (name: string, include: string[], exclude: string[] = []) =>
      createMonitoringQuery(db, organizationId, {
        projectId,
        name,
        queryAst: { include, exclude, exactPhrases: [] },
        booleanQuery: include.join(" OR "),
        sourceTypes: ["news"],
      });
    await query("THY", ["THY"]);
    await query("AK", ["AK"]);
    await query("banka", ["banka*"], ["spor"]);
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("creates mentions only for whole-word matches", async () => {
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId));
    const titles = [
      "THY'nin yeni uçağı geldi", // THY, with a Turkish suffix
      "ARTHYMIA tedavisinde yeni dönem", // contains THY inside a word
      "AK Parti toplandı", // AK
      "Akbank ve akşam haberleri; ak kağıt", // contains AK/ak inside words, lowercase ak
      "Bankalar faiz kararını bekliyor", // banka*
      "Bankalar spor kulübüne sponsor oldu", // banka* but excluded by "spor"
    ];
    await ingestSource(db, source!, new FixedTitles(titles));

    const mentions = await listRecentMentions(db, organizationId, { projectId, limit: 100 });
    const byTitle = (title: string) =>
      mentions.filter((m) => m.article.title === title).flatMap((m) => m.mention.matchedTerms);
    expect(byTitle(titles[0]!)).toEqual(["THY"]);
    expect(byTitle(titles[1]!)).toEqual([]);
    expect(byTitle(titles[2]!)).toEqual(["AK"]);
    expect(byTitle(titles[3]!)).toEqual([]);
    expect(byTitle(titles[4]!)).toEqual(["banka*"]);
    expect(byTitle(titles[5]!)).toEqual([]);
  });
});
