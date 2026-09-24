import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves PATCH /api/organizations/roles/[roleId]
 * can't edit an existing custom role to add a permission the editor
 * doesn't have. Regression: this route validated shape only
 * (updateCustomRoleSchema), never that the new `permissions` set was a
 * subset of the caller's own — a live escalation path for anyone
 * already assigned that role (including the editor themselves, whose
 * next request re-resolves permissions from the now-broader role).
 */
const requirePermission = vi.fn();
const updateCustomRole = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  updateCustomRole: (...args: unknown[]) => updateCustomRole(...args),
  deleteCustomRole: vi.fn(),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { PATCH } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/organizations/roles/role-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/organizations/roles/[roleId] — permission ceiling", () => {
  it("rejects adding a permission the editor doesn't have", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members"],
    });

    const response = await PATCH(
      makeRequest({ name: "Escalated", permissions: ["org:manage_members", "org:manage_billing"] }),
      { params: Promise.resolve({ roleId: "role-1" }) },
    );
    expect(response.status).toBe(403);
    expect(updateCustomRole).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("updates the role when every new permission is one the editor has", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members", "mentions:read"],
    });
    updateCustomRole.mockResolvedValueOnce({
      ok: true,
      role: { id: "role-1", name: "Reader", permissions: ["mentions:read"] },
    });

    const response = await PATCH(makeRequest({ name: "Reader", permissions: ["mentions:read"] }), {
      params: Promise.resolve({ roleId: "role-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateCustomRole).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "role-1",
      expect.objectContaining({ permissions: ["mentions:read"] }),
    );
  });
});
