import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test, same rationale as apps/web/src/app/api/account/
 * delete/route.test.ts — proving the route propagates a failure from
 * softDeleteOrganizationWithAuditLog (rather than swallowing it) needs
 * forcing that call to fail on demand. The atomicity of the soft-delete +
 * audit-log write itself is proven against real Postgres in
 * packages/db/src/repositories/privacy.integration.test.ts, not here.
 */
const requireOrgContext = vi.fn();
const softDeleteOrganizationWithAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireOrgContext: (...args: unknown[]) => requireOrgContext(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  softDeleteOrganizationWithAuditLog: (...args: unknown[]) =>
    softDeleteOrganizationWithAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(confirmName: string): Request {
  return new Request("http://localhost/api/organizations/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  });
}

describe("POST /api/organizations/delete", () => {
  it("propagates a failure from softDeleteOrganizationWithAuditLog rather than swallowing it", async () => {
    requireOrgContext.mockResolvedValueOnce({
      organizationId: "org-1",
      organizationName: "Acme",
      userId: "user-1",
      role: "organization_owner",
    });
    softDeleteOrganizationWithAuditLog.mockRejectedValueOnce(new Error("transient DB error"));

    await expect(POST(makeRequest("Acme"))).rejects.toThrow("transient DB error");
  });

  it("deletes the organization on success", async () => {
    requireOrgContext.mockResolvedValueOnce({
      organizationId: "org-2",
      organizationName: "Acme",
      userId: "user-2",
      role: "organization_owner",
    });
    softDeleteOrganizationWithAuditLog.mockResolvedValueOnce(undefined);

    const response = await POST(makeRequest("Acme"));
    expect(response.status).toBe(200);

    expect(softDeleteOrganizationWithAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      "user-2",
    );
  });
});
