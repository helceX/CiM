import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test, same rationale as apps/web/src/app/api/account/
 * delete/route.test.ts — proving the audit log is written only after
 * softDeleteOrganization actually commits needs forcing that call to fail
 * on demand.
 */
const requireOrgContext = vi.fn();
const softDeleteOrganization = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireOrgContext: (...args: unknown[]) => requireOrgContext(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  softDeleteOrganization: (...args: unknown[]) => softDeleteOrganization(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(confirmName: string): Request {
  return new Request("http://localhost/api/organizations/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  });
}

describe("POST /api/organizations/delete — audit-log ordering", () => {
  it("does not record organization.deleted when softDeleteOrganization fails", async () => {
    requireOrgContext.mockResolvedValueOnce({
      organizationId: "org-1",
      organizationName: "Acme",
      userId: "user-1",
      role: "organization_owner",
    });
    softDeleteOrganization.mockRejectedValueOnce(new Error("transient DB error"));

    await expect(POST(makeRequest("Acme"))).rejects.toThrow("transient DB error");

    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("records organization.deleted only after softDeleteOrganization has actually succeeded", async () => {
    requireOrgContext.mockResolvedValueOnce({
      organizationId: "org-2",
      organizationName: "Acme",
      userId: "user-2",
      role: "organization_owner",
    });
    softDeleteOrganization.mockResolvedValueOnce(undefined);

    const response = await POST(makeRequest("Acme"));
    expect(response.status).toBe(200);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      expect.objectContaining({ action: "organization.deleted" }),
    );
    const softDeleteCallOrder = softDeleteOrganization.mock.invocationCallOrder[0]!;
    const auditCallOrder = recordAuditLog.mock.invocationCallOrder[0]!;
    expect(auditCallOrder).toBeGreaterThan(softDeleteCallOrder);
  });
});
