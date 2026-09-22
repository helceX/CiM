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

/**
 * docs/architecture/SECURITY.md §83 / docs/architecture/DATA_MODEL.md
 * "ApiKey" — FEATURE_MATRIX.md's "API keys + public API" row (MVP:
 * "Internal only"; a self-serve v1 public API is its own later phase).
 * Only `hashedSecret` is ever stored — the raw secret is returned once,
 * at creation, and never again (same discipline as verification/reset
 * tokens, `packages/core/tokens.ts`). `scopes` reuses `Permission`
 * (`packages/core/authz.ts`) rather than inventing a parallel taxonomy —
 * SECURITY.md's own "same authorization path as session-based requests"
 * requirement means an API key's `read:mentions`-style scope IS a
 * `Permission` string, just checked by array membership instead of
 * `can(role, permission)`.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hashedSecret: text("hashed_secret").notNull(),
    scopes: text("scopes").array().notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // Revoked, not deleted — a revoked key stays visible in the list
    // (with its scopes/creator) so an admin can see it was issued and
    // pulled, the same append-only-history spirit as an AuditLog row.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("api_keys_hashed_secret_uidx").on(table.hashedSecret),
    index("api_keys_org_idx").on(table.organizationId),
  ],
);
