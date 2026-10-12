import { beforeEach, describe, expect, it, vi } from "vitest";
const permission = vi.fn();
const find = vi.fn();
const update = vi.fn();
const audit = vi.fn();
const limiter = vi.fn();
vi.mock("@/lib/tenant", () => ({ requirePermission: (...args: unknown[]) => permission(...args) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => limiter(...args) }));
vi.mock("@cim/db", () => ({ db: {}, getMonitoringQuery: (...args: unknown[]) => find(...args), setMonitoringQueryStatus: (...args: unknown[]) => update(...args), recordAuditLog: (...args: unknown[]) => audit(...args) }));
const { PATCH } = await import("./route");
const id = "00000000-0000-4000-8000-000000000001";
const request = (status = "paused") => new Request("https://mediaory.io/api/social/test/state", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
const params = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  permission.mockResolvedValue({ organizationId: "own-org", userId: "member" });
  limiter.mockResolvedValue({ allowed: true });
  find.mockResolvedValue({ id, sourceTypes: ["social"] });
  update.mockResolvedValue({ id, status: "paused" });
});
describe("customer social monitoring pause/resume", () => {
  it("requires write permission before reading or updating any monitoring", async () => {
    permission.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await PATCH(request(), params)).status).toBe(403);
    expect(find).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it("refuses another organization's monitoring and mixed-source monitorings", async () => {
    find.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ sourceTypes: ["social", "news"] });
    expect((await PATCH(request(), params)).status).toBe(404);
    expect((await PATCH(request(), params)).status).toBe(404);
    expect(find).toHaveBeenCalledWith(expect.anything(), "own-org", id);
    expect(update).not.toHaveBeenCalled();
  });
  it("pauses only the session's organization, records an audit, and validates status", async () => {
    expect((await PATCH(request(), params)).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.anything(), "own-org", id, "paused");
    expect(audit).toHaveBeenCalledWith(expect.anything(), "own-org", expect.objectContaining({ action: "social_monitoring.paused", actorUserId: "member" }));
    expect((await PATCH(request("deleted"), params)).status).toBe(400);
  });
});
