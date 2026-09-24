import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves POST /api/organizations/members/invite
 * can't invite someone to a role more powerful than the inviter's own.
 * Regression: this route only checked that the target role *existed*,
 * not that its permissions were a subset of the inviter's — a custom
 * role granted nothing but org:manage_members (the only permission
 * this route requires) could invite a brand-new organization_admin
 * (every permission there is).
 */
const requirePermission = vi.fn();
const resolvePermissionsForRoleString = vi.fn();
const getCurrentUser = vi.fn();
const checkRateLimit = vi.fn();
const findUserByEmail = vi.fn();
const inviteMember = vi.fn();
const recordAuditLog = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  resolvePermissionsForRoleString: (...args: unknown[]) => resolvePermissionsForRoleString(...args),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/email", () => ({
  invitationEmailBody: () => "body",
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
vi.mock("@cim/config", () => ({
  getEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));
vi.mock("@cim/db", () => ({
  db: {},
  findUserByEmail: (...args: unknown[]) => findUserByEmail(...args),
  inviteMember: (...args: unknown[]) => inviteMember(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/organizations/members/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/organizations/members/invite — role ceiling", () => {
  it("rejects inviting someone to a role whose permissions exceed the inviter's own", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      organizationName: "Acme",
      // Only org:manage_members — the one permission this route requires.
      permissions: ["org:manage_members"],
    });
    getCurrentUser.mockResolvedValueOnce({ id: "user-1", firstName: "A", lastName: "B" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserByEmail.mockResolvedValueOnce(undefined);
    resolvePermissionsForRoleString.mockResolvedValueOnce([
      "org:manage_members",
      "org:manage_billing",
      "org:manage_settings",
    ]);

    const response = await POST(
      makeRequest({ email: "new-admin@example.com", role: "organization_admin" }),
    );
    expect(response.status).toBe(403);
    expect(inviteMember).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("invites when the target role is within the inviter's own permissions", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      organizationName: "Acme",
      permissions: ["org:manage_members", "mentions:read"],
    });
    getCurrentUser.mockResolvedValueOnce({ id: "user-1", firstName: "A", lastName: "B" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserByEmail.mockResolvedValueOnce(undefined);
    resolvePermissionsForRoleString.mockResolvedValueOnce(["mentions:read"]);
    inviteMember.mockResolvedValueOnce({ membershipId: "membership-1" });

    const response = await POST(makeRequest({ email: "viewer@example.com", role: "viewer" }));
    expect(response.status).toBe(200);
    expect(inviteMember).toHaveBeenCalled();
  });
});
