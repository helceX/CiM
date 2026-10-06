import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type ArchiveFile = { name: string; key: string; bytes: number; contentType: string };

/**
 * One archive per organization per period (a week, Monday–Sunday in Türkiye time):
 * the week's mentions rendered as a self-contained HTML page and a spreadsheet,
 * stored in object storage (Cloudflare R2), not in this database. Customers open
 * them from the Archive page; the app only ever stores the pointers and counts here.
 * `deletedAt` is set when the week's mentions were removed from the database —
 * which only ever happens after the files were stored and verified.
 */
export const archiveRuns = pgTable(
  "archive_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("weekly"),
    /** first day of the period (Monday), Türkiye calendar */
    periodStart: date("period_start", { mode: "string" }).notNull(),
    /** last day of the period (Sunday), inclusive */
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    /** building | ready | failed */
    status: text("status").notNull().default("building"),
    mentionCount: integer("mention_count").notNull().default(0),
    /** more mentions than one archive holds: the first N were archived */
    truncated: boolean("truncated").notNull().default(false),
    files: jsonb("files").$type<ArchiveFile[]>().notNull().default([]),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("archive_runs_org_kind_period_uidx").on(table.organizationId, table.kind, table.periodStart),
    index("archive_runs_org_idx").on(table.organizationId, table.periodStart),
  ],
);

export type ArchiveRun = typeof archiveRuns.$inferSelect;
