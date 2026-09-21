import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Global identity. NOT tenant-scoped — a user can belong to multiple
 * organizations via organizationMemberships (see ADR-001).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  isPlatformSuperAdmin: boolean("is_platform_super_admin")
    .notNull()
    .default(false),
  timezone: text("timezone").notNull().default("Europe/Istanbul"),
  locale: text("locale").notNull().default("tr"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Account deletion (docs/architecture/SECURITY.md) is anonymization,
  // not a hard DELETE: many tables reference users.id without cascade
  // (reports.createdByUserId, auditLogs.actorUserId, …) precisely
  // because that history should survive the actor's account being
  // deleted — a hard delete would violate those FKs or require nulling
  // out records that should stay attributable. PII (email/name) is
  // overwritten in place; the row and its id persist.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
