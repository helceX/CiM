import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, projects } from "./organizations";
import { users } from "./users";

/**
 * docs/product/NEXT_FEATURES_SPEC.md §2 — a saved chart or table. `spec` is a
 * declarative definition (validated by `visualSpecSchema`), never SQL; the
 * query compiler in repositories/visuals.ts turns it into a parameterised,
 * tenant-scoped query at run time.
 */
export const savedVisuals = pgTable(
  "saved_visuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: text("kind").$type<"chart" | "table">().notNull().default("chart"),
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("saved_visuals_org_idx").on(table.organizationId, table.createdAt).where(sql`${table.deletedAt} is null`),
  ],
);
