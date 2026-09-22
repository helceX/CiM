import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, projects } from "./organizations";
import { users } from "./users";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * A saved report definition (docs/product/FEATURE_MATRIX.md — MVP ships
 * "fixed templates, PDF/CSV export"; the reorderable custom section
 * builder is P2, so there is deliberately no ReportSection table yet —
 * `templateKey` selects one of `@cim/reports`' fixed templates). Soft-
 * delete (DATA_MODEL.md conventions — same as Project/MonitoringQuery/
 * AlertRule).
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    name: text("name").notNull(),
    templateKey: text("template_key").notNull(), // weekly_summary | monitoring_overview
    periodType: text("period_type").notNull(), // rolling_7d | rolling_30d
    // docs/product/FEATURE_MATRIX.md P2 "Weekly/monthly/yearly scheduled
    // reports" — independent of periodType (a weekly schedule can still
    // cover a rolling_30d window). "none" (default) means on-demand only,
    // same as every report before this column existed.
    scheduleFrequency: text("schedule_frequency").notNull().default("none"),
    lastScheduledRunAt: timestamp("last_scheduled_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("reports_org_project_idx").on(table.organizationId, table.projectId),
  ],
);

/**
 * One generated execution of a Report (DATA_MODEL.md ReportRun) — async,
 * never inline in a request (brief §34/§91/§128). A failure surfaces
 * "Report generation failed" with the error, never a silently missing
 * report (docs/product/USER_FLOWS.md §5).
 */
export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    status: text("status").notNull().default("queued"), // queued | running | completed | failed
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("report_runs_report_created_idx").on(table.reportId, table.createdAt),
    index("report_runs_org_idx").on(table.organizationId),
  ],
);

/**
 * Output files for a completed run. Stored in Postgres (`bytea`) rather
 * than the S3-compatible object store docs/deployment/DEPLOYMENT.md
 * describes for production — MinIO isn't provisioned in every
 * environment this runs in, and report exports are small enough (a few
 * pages of PDF, a CSV) that this is a genuine, durable, zero-extra-infra
 * default. Swapping to S3 later is a repository-layer change, not a
 * schema one.
 */
export const reportFiles = pgTable(
  "report_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // pdf | csv | xlsx
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("report_files_run_idx").on(table.reportRunId)],
);

/**
 * docs/product/FEATURE_MATRIX.md P2 "Report builder (custom sections),
 * XLSX, sharing links" — the sharing-links slice. The same signed-token
 * pattern as email verification/password reset/invitations
 * (`packages/core/tokens.ts` — only `tokenHash` is ever stored, the raw
 * token is returned to the creator exactly once and lives only in the
 * link itself). Always has a real `expiresAt` — there is no "forever"
 * option, unlike an invitation's one-time-use token this is a standing
 * bearer credential for as long as it's valid, so it must lapse on its
 * own even if nobody remembers to revoke it. `revokedAt` lets an owner
 * kill a link early without waiting for expiry.
 */
export const reportShareLinks = pgTable(
  "report_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("report_share_links_run_idx").on(table.reportRunId)],
);

export type Report = typeof reports.$inferSelect;
export type ReportRun = typeof reportRuns.$inferSelect;
export type ReportFile = typeof reportFiles.$inferSelect;
export type ReportShareLink = typeof reportShareLinks.$inferSelect;
