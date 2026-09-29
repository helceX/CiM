import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — global/reference data
 * (ADR-001, DATA_MODEL.md), same pattern as `sources`/`articles`: a social
 * account is shared infrastructure, not tenant data. Tenant-specific
 * meaning attaches via `articles.authorProfileId` → `mentions`, never by
 * copying profile rows per tenant. A field the platform doesn't report
 * (followers, verified) stays `null`, rendered "Unknown" in the UI — never
 * a fabricated default (master prompt §35, §182–184).
 */
export const socialProfiles = pgTable(
  "social_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull(), // x | instagram | facebook | linkedin | tiktok | youtube | reddit | forum | mock
    externalId: text("external_id").notNull(), // platform's own account id
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    profileUrl: text("profile_url"),
    followers: integer("followers"), // null = unknown, never 0-as-default
    following: integer("following"),
    verified: boolean("verified"),
    accountType: text("account_type"), // person | brand | media | creator | unknown
    language: text("language"),
    country: text("country"),
    avatarUrl: text("avatar_url"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A platform account is unique by (platform, externalId) — a rename
    // (handle change) must resolve to the same profile row, not fork it.
    uniqueIndex("social_profiles_platform_external_id_uidx").on(table.platform, table.externalId),
    index("social_profiles_platform_idx").on(table.platform),
  ],
);

export type SocialProfile = typeof socialProfiles.$inferSelect;
