import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves POST /api/organizations/roles can't
 * define a custom role with permissions the creator doesn't have.
 * Regression: this route validated shape only (createCustomRoleSchema),
 * never that `permissions` was a subset of the caller's own — a custom
 * role granted nothing but org:manage_members (the only permission
 * this route requires) could define a new role with every permission,
 * ready to be assigned via invite/re-role (which enforce the same
 * ceiling, but only once a role like this already exists).
 */
const requirePermission = vi.fn();
const createCustomRole = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  permissionsBeyondCeiling: (caller: string[], requested: string[]) =>
    requested.filter((permission) => !caller.includes(permission)),
}));
vi.mock("@cim/db", () => ({
  db: {},
  createCustomRole: (...args: unknown[]) => createCustomRole(...args),
  listCustomRolesForOrganization: vi.fn(),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/organizations/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/organizations/roles — permission ceiling", () => {
  it("rejects defining a role with a permission the creator doesn't have", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members"],
    });

    const response = await POST(
      makeRequest({ name: "Escalated", permissions: ["org:manage_members", "org:manage_billing"] }),
    );
    expect(response.status).toBe(403);
    expect(createCustomRole).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("creates the role when every permission is one the creator has", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members", "mentions:read"],
    });
    createCustomRole.mockResolvedValueOnce({
      ok: true,
      role: { id: "role-1", name: "Reader", permissions: ["mentions:read"] },
    });

    const response = await POST(makeRequest({ name: "Reader", permissions: ["mentions:read"] }));
    expect(response.status).toBe(201);
    expect(createCustomRole).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      expect.objectContaining({ permissions: ["mentions:read"] }),
    );
  });
});
