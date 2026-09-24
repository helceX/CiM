import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves PATCH /api/organizations/roles/[roleId]
 * can't edit an existing custom role to add OR remove a permission the
 * editor doesn't have. Regression #1: this route originally validated
 * shape only (updateCustomRoleSchema), never that the new `permissions`
 * set was a subset of the caller's own — a live escalation path for
 * anyone already assigned that role (including the editor themselves,
 * whose next request re-resolves permissions from the now-broader
 * role). Regression #2: the fix for #1 only checked *added*
 * permissions, so anyone holding just org:manage_members could still
 * edit a more-privileged colleague's role and strip permissions neither
 * of them held — silently cutting that colleague's access with no
 * consent from anyone who actually held those permissions.
 */
const requirePermission = vi.fn();
const getCustomRole = vi.fn();
const updateCustomRole = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  permissionsBeyondCeiling: (caller: string[], requested: string[]) =>
    requested.filter((permission) => !caller.includes(permission)),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getCustomRole: (...args: unknown[]) => getCustomRole(...args),
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
    getCustomRole.mockResolvedValueOnce({
      id: "role-1",
      name: "Escalated",
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

  it("rejects removing a permission the editor doesn't have, even though the result is a smaller permission set", async () => {
    // The editor only holds org:manage_members, but the role being
    // edited currently grants alerts:write too (assigned to someone
    // else). Stripping alerts:write down to just org:manage_members
    // passes a naive "is the new set a subset of mine" check — it must
    // still be rejected, since the editor never held alerts:write and
    // has no standing to take it away from whoever the role is
    // actually assigned to.
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members"],
    });
    getCustomRole.mockResolvedValueOnce({
      id: "role-1",
      name: "Ops Lead",
      permissions: ["org:manage_members", "alerts:write"],
    });

    const response = await PATCH(
      makeRequest({ name: "Ops Lead", permissions: ["org:manage_members"] }),
      { params: Promise.resolve({ roleId: "role-1" }) },
    );
    expect(response.status).toBe(403);
    expect(updateCustomRole).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("updates the role when every changed permission (added or removed) is one the editor has", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members", "mentions:read", "mentions:write"],
    });
    getCustomRole.mockResolvedValueOnce({
      id: "role-1",
      name: "Reader",
      permissions: ["mentions:read", "mentions:write"],
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

  it("returns 404 without touching updateCustomRole when the role doesn't exist", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["org:manage_members"],
    });
    getCustomRole.mockResolvedValueOnce(undefined);

    const response = await PATCH(makeRequest({ name: "Ghost", permissions: ["mentions:read"] }), {
      params: Promise.resolve({ roleId: "role-1" }),
    });
    expect(response.status).toBe(404);
    expect(updateCustomRole).not.toHaveBeenCalled();
  });
});
