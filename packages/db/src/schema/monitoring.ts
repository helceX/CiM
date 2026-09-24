import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { QueryAst } from "@cim/core";
import { organizations, projects } from "./organizations";

export type { QueryAst };

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
    // docs/product/USER_FLOWS.md onboarding step 1 ("What do you want to
    // track? company/brand/product/competitor/campaign/topic/person/
    // industry") — collected since Phase 1 but discarded into an audit-log
    // metadata blob until now. Powers FEATURE_MATRIX.md P2 "Competitor
    // tracking": the Dashboard's Competitor Comparison section
    // (SCREEN_INVENTORY.md "when competitors configured") groups active
    // queries by this field rather than needing a separate Competitor entity.
    trackingTarget: text("tracking_target").notNull().default("company"),
    status: text("status").notNull().default("active"), // active | paused
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("monitoring_queries_org_project_idx").on(
      table.organizationId,
      table.projectId,
    ),
  ],
);
