import { afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema/users";
import { findLoginIdentity, linkLoginIdentity, listLoginIdentities } from "./login-identities";
import { anonymizeUser } from "./privacy";

const ids: string[] = [];
afterAll(async () => { for (const id of ids) await db.delete(users).where(eq(users.id, id)); });
it("binds by stable provider subject, refuses reassignment, and erases identities on account deletion", async () => {
  const tag = `login-${Date.now()}`;
  const [first, second] = await db.insert(users).values([
    { email: `${tag}-first@example.com`, passwordHash: "test", firstName: "First", lastName: "User", emailVerifiedAt: new Date() },
    { email: `${tag}-second@example.com`, passwordHash: "test", firstName: "Second", lastName: "User", emailVerifiedAt: new Date() },
  ]).returning();
  ids.push(first!.id, second!.id);
  await linkLoginIdentity(db, first!.id, "google", tag);
  await linkLoginIdentity(db, first!.id, "google", tag);
  expect((await listLoginIdentities(db, first!.id))).toEqual([{ provider: "google" }]);
  await expect(linkLoginIdentity(db, second!.id, "google", tag)).rejects.toThrow("Identity already linked");
  await db.update(users).set({ email: `${tag}-changed@example.com` }).where(eq(users.id, first!.id));
  expect((await findLoginIdentity(db, "google", tag))?.id).toBe(first!.id);
  await anonymizeUser(db, first!.id);
  expect(await findLoginIdentity(db, "google", tag)).toBeUndefined();
  await expect(linkLoginIdentity(db, first!.id, "github", tag)).rejects.toThrow("Invalid account");
});
