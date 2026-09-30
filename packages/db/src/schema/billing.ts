import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * docs/architecture/DATA_MODEL.md "Subscription / FeatureUsage — plan +
 * usage counters (keywords, sources, mentions, AI credits, reports,
 * users, retention) — populated from day one even though billing
 * enforcement is a later phase, so usage history isn't lost waiting for
 * billing to ship" + FEATURE_MATRIX.md "Billing: Usage counters only"
 * (MVP; "Plan enforcement" is its own, separate P3 row). `plan` is a
 * label only — nothing in this codebase reads it to gate a feature yet.
 * No row for an org means "free" (same lazy-default convention
 * `getRetentionPolicy` already establishes — a row is created only on
 * an explicit write, never provisioned at registration).
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"), // free | starter | pro | enterprise
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per organization per capture, written by the worker's
 * capture_feature_usage job — the same pre-rolled-snapshot discipline
 * DATA_MODEL.md's DailyAggregate describes for dashboard metrics,
 * applied here to usage counters instead of computing them ad hoc per
 * page load. Each count is a fresh `COUNT(*)` against the source tables
 * at capture time, not an incrementing counter touched at every usage
 * site — so a missed increment somewhere can never make this drift from
 * reality, and history survives even though nothing enforces these
 * numbers against a plan limit yet.
 */
export const featureUsageSnapshots = pgTable(
  "feature_usage_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    keywordsCount: integer("keywords_count").notNull(),
    sourcesCount: integer("sources_count").notNull(),
    mentionsCount: integer("mentions_count").notNull(),
    aiCreditsCount: integer("ai_credits_count").notNull(),
    reportsCount: integer("reports_count").notNull(),
    usersCount: integer("users_count").notNull(),
  },
  (table) => [index("feature_usage_snapshots_org_captured_idx").on(table.organizationId, table.capturedAt)],
);

export const CREDIT_LEDGER_KINDS = ["grant", "keyword_day", "ai_call", "adjustment"] as const;
export type CreditLedgerKind = (typeof CREDIT_LEDGER_KINDS)[number];

/**
 * docs/product/NEXT_FEATURES_SPEC.md §3 — append-only credit ledger. Rows
 * are never updated or deleted (a correction is a new `adjustment` row), so
 * the balance is always `SUM(amount)` and history is auditable. Debits are
 * negative, grants positive. Metering is measure-only for now: nothing
 * blocks on the balance and no price is attached to a credit.
 *
 * `ref_id` makes writers idempotent: the daily keyword meter uses the date
 * ("2026-09-30"), so running the job twice cannot double-charge a day.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").$type<CreditLedgerKind>().notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull().default(""),
    refId: text("ref_id"),
  },
  (table) => [
    index("credit_ledger_org_occurred_idx").on(table.organizationId, table.occurredAt),
    uniqueIndex("credit_ledger_org_kind_ref_uniq")
      .on(table.organizationId, table.kind, table.refId)
      .where(sql`${table.refId} is not null`),
  ],
);
