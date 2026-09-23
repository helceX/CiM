import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test, same rationale as apps/web/src/app/api/account/
 * delete/route.test.ts — this proves a cross-entity consistency check
 * (the query named in the request actually belongs to the project named
 * in the same request) that's cheap to fake with two independently
 * "valid" rows but awkward to set up as a real-Postgres fixture on every
 * run.
 */
const requireOrgContext = vi.fn();
const getProject = vi.fn();
const getMonitoringQuery = vi.fn();
const createAlertRule = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireOrgContext: (...args: unknown[]) => requireOrgContext(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getProject: (...args: unknown[]) => getProject(...args),
  getMonitoringQuery: (...args: unknown[]) => getMonitoringQuery(...args),
  createAlertRule: (...args: unknown[]) => createAlertRule(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const basePayload = {
  projectId: "11111111-1111-4111-8111-111111111111",
  queryId: "22222222-2222-4222-8222-222222222222",
  name: "Negative spike",
  type: "keyword",
  channels: ["in_app"],
  cooldownMinutes: 60,
};

describe("POST /api/alerts — project/query consistency", () => {
  it("rejects a query that belongs to a different project than the one named in the request", async () => {
    requireOrgContext.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId, name: "Project A" });
    getMonitoringQuery.mockResolvedValueOnce({
      id: basePayload.queryId,
      projectId: "33333333-3333-4333-8333-333333333333", // Project B, not A
      trackingTarget: null,
    });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(400);

    expect(createAlertRule).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("creates the rule when the query actually belongs to the named project", async () => {
    requireOrgContext.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId, name: "Project A" });
    getMonitoringQuery.mockResolvedValueOnce({
      id: basePayload.queryId,
      projectId: basePayload.projectId,
      trackingTarget: null,
    });
    createAlertRule.mockResolvedValueOnce({ id: "rule-1" });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(createAlertRule).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      expect.objectContaining({ projectId: basePayload.projectId, queryId: basePayload.queryId }),
    );
  });
});
