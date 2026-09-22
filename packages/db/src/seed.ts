import { sql } from "drizzle-orm";
import { turkishFold } from "@cim/core";
import { createDb } from "./client";
import {
  articles,
  mentions,
  monitoringQueries,
  organizationMemberships,
  organizations,
  projects,
  sources,
  users,
  workspaces,
} from "./schema/index";

/**
 * Synthetic, clearly fictional demo data (brief §122) — never a real
 * brand's real coverage. Lets the full UX (dashboard, mentions, search)
 * be exercised before the ingestion pipeline (Phase 2+) is producing
 * live data. Safe to run repeatedly against a fresh dev database.
 */
async function main() {
  const db = createDb();

  console.log("Seeding demo organization...");
  const [org] = await db
    .insert(organizations)
    .values({ name: "Northwind Demo Co", slug: `northwind-demo-${Date.now()}` })
    .returning();
  if (!org) throw new Error("seed: failed to create organization");

  const [workspace] = await db
    .insert(workspaces)
    .values({ organizationId: org.id, name: "Default Workspace" })
    .returning();
  if (!workspace) throw new Error("seed: failed to create workspace");

  const [owner] = await db
    .insert(users)
    .values({
      email: "demo-owner@northwind.example",
      // password: "DemoPassw0rd!" — real scrypt hash from @cim/core's
      // hashPassword(), generated once for this fixed seed login.
      passwordHash:
        "scrypt$131072$8$1$0eb46a88cd67dc86fa6706c67b811128$97ee065a893bec706d3d69f56ae6d29c34aaf8df05b6ef20256f34210f6987c35e8de6d42d43c8e2a15b0cf786427b405a720de39ccb3441ff6d87e715300b65",
      firstName: "Demo",
      lastName: "Owner",
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (!owner) throw new Error("seed: failed to create user");

  await db.insert(organizationMemberships).values({
    organizationId: org.id,
    userId: owner.id,
    role: "organization_owner",
    status: "active",
  });

  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, workspaceId: workspace.id, name: "Brand Monitoring" })
    .returning();
  if (!project) throw new Error("seed: failed to create project");

  console.log("Seeding sources...");
  const sourceNames = [
    { name: "Daily Tech Wire", domain: "dailytechwire.example", type: "news" },
    { name: "Marketplace Journal", domain: "marketplacejournal.example", type: "news" },
    { name: "Northwind Blog Network", domain: "nwblogs.example", type: "blog" },
    { name: "Industry Pulse", domain: "industrypulse.example", type: "news" },
    { name: "Community Forum Hub", domain: "forumhub.example", type: "forum" },
  ] as const;
  const seededSources = await db
    .insert(sources)
    .values(
      sourceNames.map((s) => ({
        name: s.name,
        domain: s.domain,
        type: s.type,
        connector: "mock",
        status: "healthy" as const,
        lastCheckedAt: new Date(),
        canStoreFullText: false,
        canDisplayFullText: false,
        canDisplayExcerpt: true,
        canProcessAi: true,
      })),
    )
    .returning();

  console.log("Seeding monitoring queries...");
  const queryDefs = [
    { name: "Brand mentions", include: ["Northwind"] },
    { name: "Competitor: Southwind Co", include: ["Southwind"] },
    { name: "Product launch", include: ["Northwind Atlas"] },
    { name: "Executive mentions", include: ["Jordan Ellis", "CEO Northwind"] },
    { name: "Industry topic", include: ["sustainable logistics"] },
  ];
  const seededQueries = await db
    .insert(monitoringQueries)
    .values(
      queryDefs.map((q) => ({
        organizationId: org.id,
        projectId: project.id,
        name: q.name,
        queryAst: { include: q.include, exclude: [], exactPhrases: [] },
        booleanQuery: q.include.map((t) => `"${t}"`).join(" OR "),
        // Matches the seeded sources' actual Source.type values below
        // (news/blog/forum) so live mock crawls of those sources can
        // match these queries too, not just the pre-seeded mentions.
        sourceTypes: ["news", "blog", "forum"],
      })),
    )
    .returning();

  console.log("Seeding articles + mentions...");
  const sentiments = ["positive", "neutral", "negative", null] as const;
  const priorities = ["low", "normal", "high", "critical"] as const;
  const headlines = [
    "Northwind expands logistics network into three new regions",
    "Analysts weigh in on Northwind's quarterly performance",
    "Northwind Atlas product line receives mixed early reviews",
    "Southwind Co announces competing platform update",
    "Sustainable logistics trends reshape the sector in 2026",
    "Northwind CEO Jordan Ellis outlines 2027 strategy",
    "Customers report delays following Northwind service change",
    "Industry Pulse: Northwind gains market share this quarter",
    "Community forum users discuss Northwind support experience",
    "Northwind Atlas wins regional innovation award",
    "Supply chain disruption briefly affects Northwind operations",
    "Northwind partners with regional carriers for expansion",
    "Opinion: what Northwind's growth means for the sector",
    "Northwind Blog Network: behind the scenes of Atlas launch",
    "Southwind Co responds to Northwind's market gains",
    "Northwind reports record customer satisfaction scores",
    "Regulatory review begins for Northwind's regional expansion",
    "Northwind Atlas pricing draws customer feedback",
    "Marketplace Journal profiles Northwind's leadership team",
    "Northwind sustainability report highlights emissions reduction",
  ];

  const seededArticles = await db
    .insert(articles)
    .values(
      headlines.map((title, i) => {
        const source = seededSources[i % seededSources.length];
        if (!source) throw new Error("seed: source index out of range");
        const publishedAt = new Date(Date.now() - i * 6 * 60 * 60 * 1000);
        return {
          sourceId: source.id,
          canonicalUrl: `https://${source.domain}/articles/${i + 1}`,
          contentHash: `seed-hash-${i + 1}`,
          title,
          storedExcerpt: null,
          language: "en",
          publishedAt,
          fetchedAt: publishedAt,
          authorName: null,
          // docs/architecture/ADR-002-SEARCH.md MVP tier — insertArticle
          // populates this on every real write path; this bulk seed
          // insert bypasses that helper for batch-insert efficiency, so
          // it has to compute the same value inline or every seeded
          // article would be permanently unsearchable via full-text match.
          searchVector: sql`to_tsvector('simple', ${turkishFold(title)})`,
        };
      }),
    )
    .returning();

  await db.insert(mentions).values(
    seededArticles.map((article, i) => {
      const query = seededQueries[i % seededQueries.length];
      if (!query) throw new Error("seed: query index out of range");
      return {
        organizationId: org.id,
        projectId: project.id,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: [query.name],
        relevanceScore: String(60 + ((i * 7) % 40)),
        sentiment: sentiments[i % sentiments.length],
        sentimentConfidence: sentiments[i % sentiments.length] ? "0.780" : null,
        priority: priorities[i % priorities.length],
        status: "new" as const,
        createdAt: article.publishedAt ?? new Date(),
      };
    }),
  );

  console.log(
    `Seed complete. Organization: ${org.name} (${org.slug}). Login: demo-owner@northwind.example / DemoPassw0rd!`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
