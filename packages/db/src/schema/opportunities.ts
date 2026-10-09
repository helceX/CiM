import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { mentions } from "./content";
import { users } from "./users";

/** Tenant-owned profile used to explain opportunity relevance; no profile data is shared across orgs. */
export const opportunityProfiles = pgTable(
  "opportunity_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationType: text("organization_type").notNull().default("company"),
    sector: text("sector").notNull().default(""),
    startupStage: text("startup_stage").notNull().default(""),
    operatingRegions: text("operating_regions").array().notNull().default([]),
    sectors: text("sectors").array().notNull().default([]),
    technologies: text("technologies").array().notNull().default([]),
    themes: text("themes").array().notNull().default([]),
    opportunityTypes: text("opportunity_types").array().notNull().default([]),
    eligibilityConstraints: text("eligibility_constraints")
      .array()
      .notNull()
      .default([]),
    languages: text("languages").array().notNull().default(["tr"]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("opportunity_profiles_org_uidx").on(table.organizationId)],
);

export const opportunityFollowups = pgTable(
  "opportunity_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mentionId: uuid("mention_id").notNull(),
    status: text("status").notNull().default("new"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sourceVerifiedAt: timestamp("source_verified_at", { withTimezone: true }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.mentionId],
      foreignColumns: [mentions.organizationId, mentions.id],
      name: "opportunity_followups_org_mention_fk",
    }).onDelete("cascade"),
    uniqueIndex("opportunity_followups_org_mention_uidx").on(
      table.organizationId,
      table.mentionId,
    ),
    index("opportunity_followups_org_status_due_idx").on(
      table.organizationId,
      table.status,
      table.dueAt,
    ),
  ],
);

export type OpportunityProfile = typeof opportunityProfiles.$inferSelect;
export type OpportunityFollowup = typeof opportunityFollowups.$inferSelect;
