import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users } from "../schema/users";

/** Global identity table — intentionally not tenant-scoped (ADR-001). */

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return user;
}

export async function findUserById(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export async function markUserVerified(db: Db, userId: string) {
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}
