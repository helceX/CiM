import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, projects } from "./organizations";
import { monitoringQueries } from "./monitoring";
import { users } from "./users";

/**
 * MVP alert types (docs/product/FEATURE_MATRIX.md): keyword (any new
 * mention on the rule's query), high_relevance (priority high/critical),
 * spike (mention volume vs. a transparent rolling baseline — brief §72).
 * Sentiment-shift/competitor/engagement-spike/emerging-topic/crisis are
 * P2 — the `type` column is text, not a Postgres enum, so adding those
 * later is a data change, not a migration (same convention as
 * organizationMemberships.role, ADR-005).
 */
export const alertRules = pgTable(
  "alert_rules",
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
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    name: text("name").notNull(),
    type: text("type").notNull(), // keyword | high_relevance | spike
    channels: text("channels").array().notNull().default(["in_app"]), // in_app | email
    cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
    status: text("status").notNull().default("active"), // active | paused
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alert_rules_org_idx").on(table.organizationId, table.createdAt),
    index("alert_rules_query_idx").on(table.queryId),
  ],
);

/**
 * A rule firing once, deduplicated/grouped at evaluation time (brief
 * §19–20 alert fatigue) rather than one row per matching mention.
 */
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    alertRuleId: uuid("alert_rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    triggerSummary: text("trigger_summary").notNull(),
    mentionIds: uuid("mention_ids").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alert_events_org_created_idx").on(table.organizationId, table.createdAt),
    index("alert_events_rule_created_idx").on(table.alertRuleId, table.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // alert | system
    title: text("title").notNull(),
    body: text("body").notNull(),
    relatedAlertEventId: uuid("related_alert_event_id").references(() => alertEvents.id, {
      onDelete: "set null",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_org_idx").on(table.organizationId),
  ],
);

export type AlertRule = typeof alertRules.$inferSelect;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
