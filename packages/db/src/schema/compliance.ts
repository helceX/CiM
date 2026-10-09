import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Global/reference data (like `sources`) — publisher-facing compliance, not
 * tenant data. A blocked domain is never crawled and can't be re-added as a
 * source; a takedown request is how a publisher asks us to stop.
 */
export const blockedDomains = pgTable(
  "blocked_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Normalised host: lower-case, no "www." (see normalizeHost in @cim/core).
    domain: text("domain").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("blocked_domains_domain_uidx").on(table.domain)],
);

export const takedownRequests = pgTable(
  "takedown_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    publisher: text("publisher").notNull(),
    // Site / feed / article address(es) the requester wants removed, as typed.
    targets: text("targets").notNull(),
    message: text("message").notNull().default(""),
    status: text("status").notNull().default("open"), // open | resolved | rejected
    resolutionNote: text("resolution_note"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("takedown_requests_status_idx").on(table.status, table.createdAt)],
);

/**
 * KVKK accountability: the record that personal data was erased (the erasure regulation expects
 * these records to be kept). Not tenant data and holds no personal data — only ids and counts — so
 * it can safely outlive the organization it describes.
 */
export const erasureLog = pgTable(
  "erasure_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** organization_erased */
    kind: text("kind").notNull(),
    /** the organization (or other subject) whose data was erased */
    subjectId: uuid("subject_id").notNull(),
    /** counts of what was erased, e.g. { mentions: 1200, archiveFiles: 8 } */
    detail: jsonb("detail").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("erasure_log_kind_idx").on(table.kind, table.createdAt)],
);

export type BlockedDomain = typeof blockedDomains.$inferSelect;
export type TakedownRequest = typeof takedownRequests.$inferSelect;
export type ErasureLogEntry = typeof erasureLog.$inferSelect;
