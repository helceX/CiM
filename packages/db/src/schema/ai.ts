import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, projects } from "./organizations";
import { mentions } from "./content";

/**
 * Global/reference data (ADR-001, DATA_MODEL.md) — an Entity/Topic is
 * shared across tenants the same way a Source or Article is; tenant
 * meaning attaches via the mentionEntities/mentionTopics join tables
 * below, never by copying rows per tenant.
 */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // company | brand | person | product | organization | place | other
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("entities_name_idx").on(table.name)],
);

/** Alias/synonym resolution (brief §13, §102) — an alias resolves to one canonical Entity. */
export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (table) => [
    index("entity_aliases_entity_idx").on(table.entityId),
    index("entity_aliases_alias_idx").on(table.alias),
  ],
);

/** AI-derived grouping, distinct from user-created Tags (DATA_MODEL.md). */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("topics_name_uidx").on(table.name)],
);

export const mentionEntities = pgTable(
  "mention_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentionId: uuid("mention_id")
      .notNull()
      .references(() => mentions.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    salience: numeric("salience", { precision: 4, scale: 3 }).notNull(),
  },
  (table) => [
    index("mention_entities_mention_idx").on(table.mentionId),
    uniqueIndex("mention_entities_mention_entity_uidx").on(table.mentionId, table.entityId),
  ],
);

export const mentionTopics = pgTable(
  "mention_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentionId: uuid("mention_id")
      .notNull()
      .references(() => mentions.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  },
  (table) => [
    index("mention_topics_mention_idx").on(table.mentionId),
    uniqueIndex("mention_topics_mention_topic_uidx").on(table.mentionId, table.topicId),
  ],
);

/**
 * Tenant-scoped AI-generated insight (docs/architecture/AI_ARCHITECTURE.md
 * Trust Layer). `kind` is `whats_changed` for the MVP dashboard insight,
 * or `recommendation` (P2 — one row per RecommendationItem a single
 * generateRecommendations call returns, `why`/`priority` populated only
 * for that kind); executive_summary/risk/opportunity remain unbuilt P2
 * kinds. The column stays text so adding a kind is a data change, not a
 * migration (same convention as alertRules.type).
 */
export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    method: text("method").notNull(),
    // Only set for kind: "recommendation" — the Why/Priority half of
    // AI_ARCHITECTURE.md's "Recommendation + Why + Evidence + Priority +
    // Confidence" shape (`summary` above holds the Recommendation text,
    // `confidence` the Confidence). Null for every other kind.
    why: text("why"),
    priority: text("priority"), // low | medium | high
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("insights_org_project_created_idx").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/**
 * Mandatory, not optional (AI_ARCHITECTURE.md Trust Layer) — an Insight
 * with no InsightEvidence rows cannot be rendered as a factual claim.
 */
export const insightEvidence = pgTable(
  "insight_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    mentionId: uuid("mention_id")
      .notNull()
      .references(() => mentions.id, { onDelete: "cascade" }),
  },
  (table) => [index("insight_evidence_insight_idx").on(table.insightId)],
);

export type Entity = typeof entities.$inferSelect;
export type EntityAlias = typeof entityAliases.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type MentionEntity = typeof mentionEntities.$inferSelect;
export type MentionTopic = typeof mentionTopics.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type InsightEvidence = typeof insightEvidence.$inferSelect;
