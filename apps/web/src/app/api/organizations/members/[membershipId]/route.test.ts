import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves PATCH /api/organizations/members/[id]
 * can't re-role a member (including the caller themselves) to a role
 * more powerful than the caller's own. Regression: this route only
 * checked that the target role *existed*, not that its permissions
 * were a subset of the caller's — a custom role granted nothing but
 * org:manage_members (the only permission this route requires) could
 * re-role anyone, including its own holder, straight to
 * organization_admin (every permission there is).
 */
const requirePermission = vi.fn();
const resolvePermissionsForRoleString = vi.fn();
const updateMemberRole = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  resolvePermissionsForRoleString: (...args: unknown[]) => resolvePermissionsForRoleString(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  updateMemberRole: (...args: unknown[]) => updateMemberRole(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
  revokeAllSessionsForUser: vi.fn(),
  revokeMembership: vi.fn(),
}));

const { PATCH } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/organizations/members/membership-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/organizations/members/[membershipId] — role ceiling", () => {
  it("rejects re-roling to a role whose permissions exceed the caller's own", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      // Only org:manage_members — the one permission this route requires.
      permissions: ["org:manage_members"],
    });
    resolvePermissionsForRoleString.mockResolvedValueOnce([
      "org:manage_members",
      "org:manage_billing",
      "org:manage_settings",
      // (the real organization_admin grants every permission — a
      // representative superset is enough to prove the ceiling holds)
    ]);

    const response = await PATCH(makeRequest({ role: "organization_admin" }), {
      params: Promise.resolve({ membershipId: "membership-1" }),
    });
    expect(response.status).toBe(403);
    expect(updateMemberRole).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("allows re-roling to a role within the caller's own permissions", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members", "mentions:read"],
    });
    resolvePermissionsForRoleString.mockResolvedValueOnce(["mentions:read"]);
    updateMemberRole.mockResolvedValueOnce({ ok: true });

    const response = await PATCH(makeRequest({ role: "viewer" }), {
      params: Promise.resolve({ membershipId: "membership-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateMemberRole).toHaveBeenCalledWith(expect.anything(), "org-1", "membership-1", "viewer");
  });
});
