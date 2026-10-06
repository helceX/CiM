import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Platform-wide (not tenant data): the one-row state of the background catalog
 * import, and what happened to each catalog feed it tried. The worker adds the
 * Türkiye and world catalog feeds in small, fetch-tested batches; an operator can
 * pause it from /admin/sources. Failed feeds are retried later, not hammered.
 */
export const catalogImportState = pgTable("catalog_import_state", {
  id: integer("id").primaryKey().default(1), // always 1 — a single row
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  /** Why the last run added nothing ("paused", "crawl backlog …", "finished"); null when it worked. */
  lastNote: text("last_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogImportAttempts = pgTable("catalog_import_attempts", {
  url: text("url").primaryKey(),
  catalogKey: text("catalog_key").notNull(),
  /** added | failed | skipped (blocked / licence-required) */
  status: text("status").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull().default(1),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CatalogImportState = typeof catalogImportState.$inferSelect;
export type CatalogImportAttempt = typeof catalogImportAttempts.$inferSelect;
