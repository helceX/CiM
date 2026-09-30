import { integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * docs/architecture/SECURITY.md "Privacy / KVKK-readiness" + Screen 17
 * (docs/ux/SCREEN_INVENTORY.md) — the policy is MVP scope ("display +
 * configure"); the cleanup worker that enforces it against Mentions is
 * explicitly P2 (docs/product/FEATURE_MATRIX.md). One row per
 * organization, created lazily on first configure — no row means "keep
 * forever" (the MVP default), same as `mentionRetentionDays: null`.
 */
export const dataRetentionPolicies = pgTable(
  "data_retention_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // null = keep forever. Enforcement worker not yet built (P2) — this
    // column only drives display/configure until then.
    mentionRetentionDays: integer("mention_retention_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("data_retention_policies_organization_idx").on(table.organizationId),
  ],
);
