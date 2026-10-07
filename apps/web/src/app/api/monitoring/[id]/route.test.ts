import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getMonitoringQuery = vi.fn();
const updateMonitoringQuery = vi.fn();
const backfillMentionsForQuery = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({ requirePermission: (...args: unknown[]) => requirePermission(...args) }));
vi.mock("@cim/db", () => ({
  db: {},
  getMonitoringQuery: (...args: unknown[]) => getMonitoringQuery(...args),
  updateMonitoringQuery: (...args: unknown[]) => updateMonitoringQuery(...args),
  backfillMentionsForQuery: (...args: unknown[]) => backfillMentionsForQuery(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { PATCH } = await import("./route");

const params = (id = "q-1") => ({ params: Promise.resolve({ id }) });
const request = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/monitoring/q-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const payload = { name: "BTM v2", include: ["btm"], exclude: [], exactPhrases: [], sourceTypes: ["news"], trackingTarget: "company" };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ organizationId: "org-1", userId: "u-1" });
  getMonitoringQuery.mockResolvedValue({ id: "q-1", projectId: "p-1" });
  updateMonitoringQuery.mockImplementation(async (_db: unknown, _org: string, id: string, patch: { sourceTypes: string[]; regionScopes: string[] }) => ({
    id,
    projectId: "p-1",
    sourceTypes: patch.sourceTypes,
    regionScopes: patch.regionScopes,
  }));
  backfillMentionsForQuery.mockResolvedValue({ scanned: 10, created: 2 });
});

describe("PATCH /api/monitoring/[id]", () => {
  it("needs monitoring:write", async () => {
    requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    const response = await PATCH(request(payload), params());
    expect(response.status).toBe(403);
    expect(updateMonitoringQuery).not.toHaveBeenCalled();
  });

  it("404s for a monitoring that is not this organization's, without updating", async () => {
    getMonitoringQuery.mockResolvedValue(undefined);
    const response = await PATCH(request(payload), params("other"));
    expect(response.status).toBe(404);
    expect(getMonitoringQuery).toHaveBeenCalledWith({}, "org-1", "other");
    expect(updateMonitoringQuery).not.toHaveBeenCalled();
  });

  it("saves the new keywords, company and scope, then picks up stored stories they match", async () => {
    const response = await PATCH(
      request({ ...payload, include: ["btm", "girişim"], regionScopes: ["TR"], company: { name: "Bilgiyi Ticarileştirme Merkezi", short: "BTM" } }),
      params(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, queryId: "q-1", backfilled: 2 });
    const patch = updateMonitoringQuery.mock.calls[0]![3];
    expect(patch.queryAst.include).toEqual(["btm", "girişim", "Bilgiyi Ticarileştirme Merkezi"]);
    expect(patch.queryAst.company).toEqual({ name: "Bilgiyi Ticarileştirme Merkezi", short: "BTM" });
    expect(patch.regionScopes).toEqual(["TR"]);
    expect(backfillMentionsForQuery).toHaveBeenCalledTimes(1);
    expect(recordAuditLog).toHaveBeenCalledWith({}, "org-1", expect.objectContaining({ action: "monitoring_query.updated", targetId: "q-1" }));
  });

  it("rejects an edit with nothing to search", async () => {
    const response = await PATCH(request({ ...payload, include: [] }), params());
    expect(response.status).toBe(400);
    expect(updateMonitoringQuery).not.toHaveBeenCalled();
  });

  it("still saves when the backfill fails", async () => {
    backfillMentionsForQuery.mockRejectedValue(new Error("boom"));
    const response = await PATCH(request(payload), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ backfilled: 0 });
  });
});
