import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Login identities are global, like users; never an organization access grant.
export const loginIdentities = pgTable("login_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("login_identity_provider_subject").on(table.provider, table.subject), uniqueIndex("login_identity_user_provider").on(table.userId, table.provider)]);
