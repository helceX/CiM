import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves POST /api/reports requires reports:write,
 * not just organization membership. Regression: this route previously
 * called requireOrgContext() (any authenticated member), while every
 * sibling report-mutation route (schedule, share) already required
 * reports:write — a role granted only reports:read (report_recipient,
 * explicitly meant to be read-only, per packages/core/src/authz.ts)
 * could still trigger a real headless-Chromium render.
 */
const requirePermission = vi.fn();
const checkRateLimit = vi.fn();
const getProject = vi.fn();
const createReport = vi.fn();
const createReportRun = vi.fn();
const enqueueReportGeneration = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/reports", () => ({
  enqueueReportGeneration: (...args: unknown[]) => enqueueReportGeneration(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getProject: (...args: unknown[]) => getProject(...args),
  createReport: (...args: unknown[]) => createReport(...args),
  createReportRun: (...args: unknown[]) => createReportRun(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const basePayload = {
  projectId: "11111111-1111-4111-8111-111111111111",
  name: "Weekly report",
  templateKey: "weekly_summary",
  periodType: "rolling_7d",
};

describe("POST /api/reports — requires reports:write", () => {
  it("returns 403 for a caller without reports:write, without creating anything", async () => {
    requirePermission.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(createReport).not.toHaveBeenCalled();
    expect(enqueueReportGeneration).not.toHaveBeenCalled();
  });

  it("creates the report and enqueues generation for a caller with reports:write", async () => {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId });
    createReport.mockResolvedValueOnce({ id: "report-1" });
    createReportRun.mockResolvedValueOnce({ id: "run-1" });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(enqueueReportGeneration).toHaveBeenCalledWith("run-1");
  });
});
