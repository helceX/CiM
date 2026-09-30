import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves POST /api/monitoring requires
 * monitoring:write, not just organization membership. Regression: this
 * route previously called requireOrgContext() (any authenticated member),
 * so a viewer or report_recipient role (both explicitly monitoring:read
 * only, per packages/core/src/authz.ts) could still create a monitoring
 * query — the same class of bug POST /api/reports had before it was
 * changed to requirePermission("reports:write").
 */
const requirePermission = vi.fn();
const getProject = vi.fn();
const createMonitoringQueryWithPlanLimit = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getProject: (...args: unknown[]) => getProject(...args),
  createMonitoringQueryWithPlanLimit: (...args: unknown[]) => createMonitoringQueryWithPlanLimit(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/monitoring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const basePayload = {
  projectId: "11111111-1111-4111-8111-111111111111",
  name: "Brand watch",
  include: ["Acme"],
  exclude: [],
  exactPhrases: [],
  sourceTypes: ["news"],
  trackingTarget: "company",
};

describe("POST /api/monitoring — requires monitoring:write", () => {
  it("returns 403 for a caller without monitoring:write, without creating anything", async () => {
    requirePermission.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(403);
    expect(getProject).not.toHaveBeenCalled();
    expect(createMonitoringQueryWithPlanLimit).not.toHaveBeenCalled();
  });

  it("creates the monitoring query for a caller with monitoring:write", async () => {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId });
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({
      ok: true,
      query: { id: "query-1" },
    });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(createMonitoringQueryWithPlanLimit).toHaveBeenCalled();
  });
});
