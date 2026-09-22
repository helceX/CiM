import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, projects } from "./organizations";
import { monitoringQueries } from "./monitoring";

/**
 * Global/reference data — NOT tenant-scoped (ADR-001, DATA_MODEL.md).
 * A Source is shared infrastructure; tenant meaning attaches via Mention.
 */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  country: text("country"),
  language: text("language"),
  type: text("type").notNull(), // news | website | blog | press | tv | radio | podcast | youtube | social | forum | comments | rss | api | other
  connector: text("connector").notNull(), // mock | rss | sitemap | web | api | social | youtube | podcast | broadcast | custom
  // The URL the connector polls — a feed URL for rss, a sitemap.xml URL
  // for sitemap, the page itself for web, or the API endpoint for api.
  // Unused by mock.
  url: text("url"),
  // docs/architecture/INGESTION.md APIConnector — an official third-party
  // API's bearer/key header, sent on every request (packages/ingestion's
  // safeFetch). Both null (the common case for rss/sitemap/web/mock) means
  // no auth header is added. `apiKey` is never returned by any API route
  // or audit log entry, the same discipline organizations.webhookUrl
  // follows for the secrets it can embed.
  apiKeyHeaderName: text("api_key_header_name"),
  apiKey: text("api_key"),
  status: text("status").notNull().default("healthy"), // healthy | delayed | error | blocked | unavailable
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  // SourcePolicy (docs/architecture/SECURITY.md — enforced at ingestion AND render)
  canStoreFullText: boolean("can_store_full_text").notNull().default(false),
  canDisplayFullText: boolean("can_display_full_text").notNull().default(false),
  canDisplayExcerpt: boolean("can_display_excerpt").notNull().default(true),
  canStoreMedia: boolean("can_store_media").notNull().default(false),
  canProcessAi: boolean("can_process_ai").notNull().default(true),
  license: text("license"),
  termsUrl: text("terms_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Global/reference — one Article can produce Mentions across tenants. */
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    canonicalUrl: text("canonical_url").notNull(),
    contentHash: text("content_hash").notNull(),
    title: text("title").notNull(),
    // Populated only when the source's SourcePolicy allows storage.
    storedExcerpt: text("stored_excerpt"),
    language: text("language"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    authorName: text("author_name"),
    storyClusterId: uuid("story_cluster_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("articles_source_idx").on(table.sourceId),
    index("articles_content_hash_idx").on(table.contentHash),
    index("articles_canonical_url_idx").on(table.canonicalUrl),
  ],
);

/** Tenant-scoped join between an Article and a MonitoringQuery match. */
export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    queryId: uuid("query_id")
      .notNull()
      .references(() => monitoringQueries.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    matchedTerms: text("matched_terms").array().notNull().default([]),
    relevanceScore: numeric("relevance_score", { precision: 5, scale: 2 }),
    sentiment: text("sentiment"), // positive | neutral | negative | null = unclassified
    sentimentConfidence: numeric("sentiment_confidence", {
      precision: 4,
      scale: 3,
    }),
    // AI enrichment (docs/architecture/AI_ARCHITECTURE.md) — pending until
    // the worker's ai_enrich job runs; failed/skipped both surface as
    // "Not available" in the UI, never a fabricated fallback (brief §92).
    aiStatus: text("ai_status").notNull().default("pending"), // pending | completed | failed | skipped
    aiSummary: text("ai_summary"),
    aiMethod: text("ai_method"), // e.g. "mock-heuristic-v1" | "anthropic:claude-haiku-4-5"
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    priority: text("priority").notNull().default("normal"), // low | normal | high | critical
    status: text("status").notNull().default("new"), // new | reviewed | archived
    reviewFeedback: text("review_feedback"), // relevant | irrelevant | duplicate
    assignedToUserId: uuid("assigned_to_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mentions_org_created_idx").on(table.organizationId, table.createdAt),
    index("mentions_org_project_idx").on(table.organizationId, table.projectId),
    index("mentions_article_idx").on(table.articleId),
    // The worker's ai_enrich job scans for pending work across tenants
    // (the ingestion cross-tenant-read exception, ADR-001) — indexed so
    // that scan stays cheap as mention volume grows.
    index("mentions_ai_status_idx").on(table.aiStatus),
    // Re-processing the same Article must not duplicate a Mention for the
    // same query (docs/architecture/INGESTION.md — pipeline idempotency).
    uniqueIndex("mentions_query_article_uidx").on(table.queryId, table.articleId),
  ],
);

/** Real, source-reported metrics only — never fabricated (brief §26). */
export const engagementMetrics = pgTable(
  "engagement_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(), // likes | comments | shares | views | reach | ...
    value: integer("value").notNull(),
    source: text("source").notNull(), // which system/API reported this
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    measurementMethod: text("measurement_method").notNull(), // reported | estimated | observed
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    isEstimated: boolean("is_estimated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("engagement_metrics_article_idx").on(table.articleId)],
);

export type Source = typeof sources.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Mention = typeof mentions.$inferSelect;
