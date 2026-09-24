import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizationMemberships } from "./organizations";
import { users } from "./users";

/**
 * Server-checked, revocable sessions (ADR-005) — not a stateless JWT.
 * The cookie holds only the session id; every field that matters for
 * revocation lives here.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_verification_tokens_user_idx").on(table.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 18 "Organization Users" — invite
 * link tokens. An invite creates the membership row immediately
 * (`status: "invited"`, docs/product/... the schema has always carried
 * this status/`invitedByUserId` for exactly this feature); this token is
 * what proves the person clicking the emailed link is actually the
 * invited address, the same signed-token pattern as email verification
 * and password reset, scoped to one membership rather than one user.
 */
export const invitationTokens = pgTable(
  "invitation_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => organizationMemberships.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invitation_tokens_membership_idx").on(table.membershipId)],
);

/**
 * Dev/test email "provider" (EMAIL_PROVIDER=console): every email the app
 * would send is recorded here instead of/alongside a log line, so E2E
 * tests (and local dev) can read verification links without a real inbox.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    kind: text("kind").notNull(), // verify_email | password_reset | daily_digest | ...
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_outbox_to_email_idx").on(table.toEmail)],
);
