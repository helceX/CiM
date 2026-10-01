import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSuperAdmin = vi.fn();
const sendEmail = vi.fn();
const checkRateLimit = vi.fn();
const findUserById = vi.fn();
const markUserVerified = vi.fn();
const listMembershipsForUser = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/admin", () => ({ requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a) }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
vi.mock("@cim/db", () => ({
  db: {},
  asOrganizationId: (id: string) => id,
  findUserById: (...a: unknown[]) => findUserById(...a),
  markUserVerified: (...a: unknown[]) => markUserVerified(...a),
  listMembershipsForUser: (...a: unknown[]) => listMembershipsForUser(...a),
  recordAuditLog: (...a: unknown[]) => recordAuditLog(...a),
}));

const testEmail = await import("./email/test/route");
const verify = await import("./users/[id]/verify/route");

const admin = { id: "admin-1", email: "owner@mediaory.io" };
const uuid = "22222222-2222-4222-8222-222222222222";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = () => new Request("http://localhost/x", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe("admin API guard", () => {
  it("answers 404 (not 401/403) to anyone who isn't a platform admin and touches nothing", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NOT_SUPER_ADMIN"));
    expect((await testEmail.POST()).status).toBe(404);
    expect((await verify.POST(post(), params(uuid))).status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markUserVerified).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/email/test", () => {
  beforeEach(() => requireSuperAdmin.mockResolvedValue(admin));

  it("mails only the signed-in admin, through the real queue path", async () => {
    const res = await testEmail.POST();
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ toEmail: "owner@mediaory.io", kind: "admin_test" });
  });

  it("is rate limited per admin", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await testEmail.POST()).status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users/[id]/verify", () => {
  beforeEach(() => requireSuperAdmin.mockResolvedValue(admin));

  it("rejects a malformed id and unknown or deleted users", async () => {
    expect((await verify.POST(post(), params("not-a-uuid"))).status).toBe(404);
    findUserById.mockResolvedValue(undefined);
    expect((await verify.POST(post(), params(uuid))).status).toBe(404);
    findUserById.mockResolvedValue({ id: uuid, deletedAt: new Date(), emailVerifiedAt: null });
    expect((await verify.POST(post(), params(uuid))).status).toBe(404);
    expect(markUserVerified).not.toHaveBeenCalled();
  });

  it("verifies a live unverified user and audits it in their organization", async () => {
    findUserById.mockResolvedValue({ id: uuid, deletedAt: null, emailVerifiedAt: null });
    listMembershipsForUser.mockResolvedValue([{ organization: { id: "org-9" } }]);
    const res = await verify.POST(post(), params(uuid));
    expect(res.status).toBe(200);
    expect(markUserVerified).toHaveBeenCalledWith({}, uuid);
    const [, orgId, entry] = recordAuditLog.mock.calls[0]!;
    expect(orgId).toBe("org-9");
    expect(entry).toMatchObject({ actorUserId: "admin-1", action: "user.email_verified_by_admin", targetId: uuid });
  });

  it("is a no-op for an already verified user", async () => {
    findUserById.mockResolvedValue({ id: uuid, deletedAt: null, emailVerifiedAt: new Date() });
    const res = await verify.POST(post(), params(uuid));
    expect(await res.json()).toMatchObject({ ok: true, alreadyVerified: true });
    expect(markUserVerified).not.toHaveBeenCalled();
  });
});
