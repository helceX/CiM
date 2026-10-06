import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { BrandGroupKindValue, QueryAst } from "@cim/core";
import { organizations, projects } from "./organizations";

export type { QueryAst };

/**
 * docs/product/NEXT_FEATURES_SPEC.md §1 — named clusters of monitoring
 * queries ("Our brands", "Competitor A", "Category X") so the product can
 * compare clusters rather than single queries. A query belongs to at most
 * one group (`monitoring_queries.brand_group_id`); ungrouped queries keep
 * working exactly as before. `color` is a key into the chart palette, never
 * a raw value, so themes can restep it.
 */
export const brandGroups = pgTable(
  "brand_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<BrandGroupKindValue>().notNull().default("own"),
    color: text("color").notNull().default("blue"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("brand_groups_org_project_idx").on(table.organizationId, table.projectId),
    // Names are unique per project among live groups (a deleted group's
    // name can be reused), case-insensitively.
    uniqueIndex("brand_groups_project_name_uniq")
      .on(table.projectId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const monitoringQueries = pgTable(
  "monitoring_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    queryAst: jsonb("query_ast").$type<QueryAst>().notNull(),
    booleanQuery: text("boolean_query").notNull(),
    sourceTypes: text("source_types").array().notNull().default([]),
    // Where to look: continent codes (EUR, ASI …) and/or ISO country codes. Empty = worldwide.
    // A story counts only when its source's country is inside (see @cim/core regions.ts).
    regionScopes: text("region_scopes").array().notNull().default([]),
    // docs/product/USER_FLOWS.md onboarding step 1 ("What do you want to
    // track? company/brand/product/competitor/campaign/topic/person/
    // industry") — collected since Phase 1 but discarded into an audit-log
    // metadata blob until now. Powers FEATURE_MATRIX.md P2 "Competitor
    // tracking": the Dashboard's Competitor Comparison section
    // (SCREEN_INVENTORY.md "when competitors configured") groups active
    // queries by this field rather than needing a separate Competitor entity.
    trackingTarget: text("tracking_target").notNull().default("company"),
    status: text("status").notNull().default("active"), // active | paused
    // Optional cluster this query belongs to (see brandGroups above).
    brandGroupId: uuid("brand_group_id").references((): AnyPgColumn => brandGroups.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("monitoring_queries_brand_group_idx").on(table.brandGroupId),
    index("monitoring_queries_org_project_idx").on(
      table.organizationId,
      table.projectId,
    ),
  ],
);
