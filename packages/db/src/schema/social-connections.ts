import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * A customer's own social account, linked by OAuth so Mediaory can read what
 * that account is permitted to see (comments on its videos, mentions of its
 * handle). Tenant data: one row per organization, never shared. Tokens are
 * stored AES-GCM-encrypted (`access_token_enc`, `refresh_token_enc`) and are
 * never selected into anything a browser receives.
 */
export const socialConnections = pgTable(
  "social_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    platform: text("platform").notNull(), // youtube | x | mock
    externalAccountId: text("external_account_id").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    profileUrl: text("profile_url"),
    avatarUrl: text("avatar_url"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    scopes: text("scopes").notNull().default(""),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"), // active | needs_reauth | error
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    // Provider paging state (e.g. the newest tweet id seen) so a poll only asks for what's new.
    cursor: jsonb("cursor").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("social_connections_org_idx").on(table.organizationId),
    uniqueIndex("social_connections_org_platform_account_uidx").on(
      table.organizationId,
      table.platform,
      table.externalAccountId,
    ),
  ],
);

/**
 * Something that happened to a connected account: a mention, a tag, a comment
 * on its video. A short excerpt and the link back to the post — never a copy of
 * the platform's content beyond that.
 */
export const socialConnectionEvents = pgTable(
  "social_connection_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => socialConnections.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    kind: text("kind").notNull(), // mention | comment | reply
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    authorHandle: text("author_handle"),
    authorName: text("author_name"),
    excerpt: text("excerpt").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("social_connection_events_uidx").on(table.connectionId, table.externalId),
    index("social_connection_events_org_time_idx").on(table.organizationId, table.occurredAt),
  ],
);

export type SocialConnection = typeof socialConnections.$inferSelect;
export type SocialConnectionEvent = typeof socialConnectionEvents.$inferSelect;
