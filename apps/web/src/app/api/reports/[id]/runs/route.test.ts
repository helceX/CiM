import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves POST /api/reports/[id]/runs ("run again")
 * requires reports:write, not just organization membership. Same
 * regression as ../route.test.ts: a report_recipient (reports:read only)
 * could previously re-trigger a real render on an existing report.
 */
const requirePermission = vi.fn();
const checkRateLimit = vi.fn();
const getReport = vi.fn();
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
  getReport: (...args: unknown[]) => getReport(...args),
  createReportRun: (...args: unknown[]) => createReportRun(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(): Request {
  return new Request("http://localhost/api/reports/report-1/runs", { method: "POST" });
}

describe("POST /api/reports/[id]/runs — requires reports:write", () => {
  it("returns 403 for a caller without reports:write, without creating a run", async () => {
    requirePermission.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(createReportRun).not.toHaveBeenCalled();
    expect(enqueueReportGeneration).not.toHaveBeenCalled();
  });

  it("creates a new run and enqueues generation for a caller with reports:write", async () => {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    getReport.mockResolvedValueOnce({ id: "report-1", periodType: "rolling_7d" });
    createReportRun.mockResolvedValueOnce({ id: "run-2" });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(200);
    expect(enqueueReportGeneration).toHaveBeenCalledWith("run-2");
  });
});
