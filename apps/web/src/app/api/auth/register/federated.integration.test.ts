import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, findLoginIdentity, findUserByEmail, schema } from "@cim/db";
vi.mock("server-only", () => ({}));
const { pending, createSession, sendEmail } = vi.hoisted(() => ({ pending: new Map<string, string>(), createSession: vi.fn(), sendEmail: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => pending.has(key) ? { value: pending.get(key) } : undefined, delete: (key: string) => pending.delete(key) }) }));
vi.mock("@/lib/federated-login", () => import("../../../../lib/federated-login"));
vi.mock("@/lib/session", () => ({ createUserSession: createSession }));
vi.mock("@/lib/rate-limit", () => ({ clientIpFrom: () => "test", checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/turnstile", () => ({ rejectIfNotHuman: async () => null }));
vi.mock("@/lib/email", () => ({ sendEmail, verificationEmailBody: () => "verification" }));
const { sealLoginValue } = await import("../../../../lib/federated-login");
const { getEnv } = await import("@cim/config");
const { POST } = await import("./route");
const cleanup: { userId: string; organizationId: string }[] = [];
const tag = `federated-${Date.now()}`;
beforeEach(() => { pending.clear(); createSession.mockClear(); sendEmail.mockClear(); });
afterAll(async () => {
  for (const item of cleanup) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, item.organizationId));
    await db.delete(schema.users).where(eq(schema.users.id, item.userId));
  }
});
const request = (email: string) => new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: "Test", lastName: "User", companyName: tag, jobTitle: "Founder", email, password: "client-controlled", federated: true }) });
async function remember(email: string) {
  const user = await findUserByEmail(db, email);
  expect(user).toBeDefined();
  const [membership] = await db.select().from(schema.organizationMemberships).where(eq(schema.organizationMemberships.userId, user!.id));
  cleanup.push({ userId: user!.id, organizationId: membership!.organizationId });
  return user!;
}
it("registers from the verified provider email rather than a modified browser email", async () => {
  const email = `${tag}-google@example.com`;
  pending.set("cim_login_pending", sealLoginValue({ provider: "google", subject: tag, email, emailVerified: true, name: "Test", expires: Date.now() + 60000 }, getEnv().SESSION_SECRET));
  const response = await POST(request(`${tag}-attacker@example.com`));
  expect(await response.json()).toMatchObject({ ok: true, signedIn: true });
  const user = await remember(email);
  expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  expect(user.isPlatformSuperAdmin).toBe(false);
  expect((await findLoginIdentity(db, "google", tag))?.id).toBe(user.id);
  expect(await findUserByEmail(db, `${tag}-attacker@example.com`)).toBeUndefined();
  expect(createSession).toHaveBeenCalledWith(user.id, expect.any(Object));
  expect(sendEmail).not.toHaveBeenCalled();
  expect(pending.has("cim_login_pending")).toBe(false);
  expect((await POST(request(email))).status).toBe(400);
});
it("requires Mediaory email verification for a Microsoft email claim", async () => {
  const email = `${tag}-ms@example.com`;
  pending.set("cim_login_pending", sealLoginValue({ provider: "microsoft", subject: tag, email, emailVerified: false, name: "Test", expires: Date.now() + 60000 }, getEnv().SESSION_SECRET));
  expect((await POST(request(email))).ok).toBe(true);
  const user = await remember(email);
  expect(user.emailVerifiedAt).toBeNull();
  expect(createSession).not.toHaveBeenCalled();
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: email, kind: "verify_email" }));
});
