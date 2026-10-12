import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { loginIdentities } from "../schema/login-identities";
import { users } from "../schema/users";

export async function findLoginIdentity(db: Db, provider: string, subject: string) {
  const [row] = await db.select({ user: users }).from(loginIdentities).innerJoin(users, eq(users.id, loginIdentities.userId))
    .where(and(eq(loginIdentities.provider, provider), eq(loginIdentities.subject, subject))).limit(1);
  return row?.user;
}

export async function linkLoginIdentity(db: Db, userId: string, provider: string, subject: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login:${provider}:${subject}`}))`);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt || !user.emailVerifiedAt) throw new Error("Invalid account");
    const existing = await findLoginIdentity(tx as unknown as Db, provider, subject);
    if (existing && existing.id !== userId) throw new Error("Identity already linked");
    if (!existing) await tx.insert(loginIdentities).values({ userId, provider, subject });
  });
}

export async function listLoginIdentities(db: Db, userId: string) {
  return db.select({ provider: loginIdentities.provider }).from(loginIdentities).where(eq(loginIdentities.userId, userId));
}
