import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** The tenant boundary. Every tenant-scoped table below references this. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // docs/product/FEATURE_MATRIX.md P2 "Slack/Teams/webhook channels" —
  // a plain HTTPS webhook, which is exactly what a Slack/Teams incoming
  // webhook already is, so this one field covers both without a
  // dedicated integration per provider. Null means no webhook alerts
  // configured yet — alert rules with the "webhook" channel checked
  // just skip delivery silently until one is set (same "nothing to
  // send" skip as the digest's zero-recipient case).
  webhookUrl: text("webhook_url"),
  // Soft delete (docs/architecture/SECURITY.md — "Supported from MVP:
  // ... organization deletion, audit trail of these actions"). A hard
  // DELETE would cascade away audit_logs.organization_id rows in the
  // same stroke, destroying the very audit trail of the deletion it's
  // supposed to leave — soft delete keeps the record intact. A
  // background purge worker enforcing real retention is later scope
  // (DataRetentionPolicy, per docs/product/FEATURE_MATRIX.md).
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Fixed MVP roles. Stored as text (not a Postgres enum) so adding custom
 * roles later (ADR-005) is a data change, not a schema migration.
 * The canonical list of valid values lives in @cim/core/authz.
 */
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"), // active | invited | revoked
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("org_memberships_org_user_uidx").on(table.organizationId, table.userId),
    index("org_memberships_org_idx").on(table.organizationId),
    index("org_memberships_user_idx").on(table.userId),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("workspaces_org_idx").on(table.organizationId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_org_idx").on(table.organizationId, table.createdAt),
    index("projects_workspace_idx").on(table.workspaceId),
  ],
);
