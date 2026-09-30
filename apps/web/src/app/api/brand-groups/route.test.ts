import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test (same approach as api/monitoring/route.test.ts):
 * brand groups are gated by monitoring:read / monitoring:write, a
 * client-supplied projectId is verified against the tenant, and repository
 * outcomes map to the right HTTP statuses.
 */
const requirePermission = vi.fn();
const getProject = vi.fn();
const createBrandGroup = vi.fn();
const listBrandGroups = vi.fn();
const updateBrandGroup = vi.fn();
const deleteBrandGroup = vi.fn();
const setQueryBrandGroup = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getProject: (...a: unknown[]) => getProject(...a),
  createBrandGroup: (...a: unknown[]) => createBrandGroup(...a),
  listBrandGroups: (...a: unknown[]) => listBrandGroups(...a),
  updateBrandGroup: (...a: unknown[]) => updateBrandGroup(...a),
  deleteBrandGroup: (...a: unknown[]) => deleteBrandGroup(...a),
  setQueryBrandGroup: (...a: unknown[]) => setQueryBrandGroup(...a),
  recordAuditLog: (...a: unknown[]) => recordAuditLog(...a),
}));

const collection = await import("./route");
const item = await import("./[id]/route");
const assign = await import("./assign/route");

const ctx = { organizationId: "org-1", userId: "user-1" };
const projectId = "11111111-1111-4111-8111-111111111111";
const uuid = "22222222-2222-4222-8222-222222222222";

function json(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/brand-groups", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const forbidden = () => {
  throw new Error("FORBIDDEN");
};

beforeEach(() => vi.clearAllMocks());

describe("brand group permissions", () => {
  it("rejects writes without monitoring:write and touches nothing", async () => {
    requirePermission.mockImplementation(forbidden);
    expect((await collection.POST(json("POST", { projectId, name: "X" }))).status).toBe(403);
    expect((await item.PATCH(json("PATCH", { name: "Y" }), params(uuid))).status).toBe(403);
    expect((await item.DELETE(json("DELETE"), params(uuid))).status).toBe(403);
    expect((await assign.POST(json("POST", { queryId: uuid, brandGroupId: null }))).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("monitoring:write");
    expect(createBrandGroup).not.toHaveBeenCalled();
    expect(updateBrandGroup).not.toHaveBeenCalled();
    expect(deleteBrandGroup).not.toHaveBeenCalled();
    expect(setQueryBrandGroup).not.toHaveBeenCalled();
  });

  it("lists with monitoring:read; unauthenticated is 401", async () => {
    requirePermission.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    expect((await collection.GET(new Request("http://localhost/api/brand-groups"))).status).toBe(401);

    requirePermission.mockResolvedValueOnce(ctx);
    listBrandGroups.mockResolvedValueOnce([{ id: uuid, name: "Us" }]);
    const res = await collection.GET(new Request(`http://localhost/api/brand-groups?projectId=${projectId}`));
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenLastCalledWith("monitoring:read");
    expect(listBrandGroups).toHaveBeenCalledWith({}, "org-1", projectId);
  });
});

describe("POST /api/brand-groups", () => {
  beforeEach(() => requirePermission.mockResolvedValue(ctx));

  it("validates input", async () => {
    expect((await collection.POST(json("POST", { projectId: "nope", name: "" }))).status).toBe(400);
    expect((await collection.POST(json("POST", { projectId, name: "A", kind: "weird" }))).status).toBe(400);
  });

  it("404s a project outside the tenant", async () => {
    getProject.mockResolvedValueOnce(undefined);
    expect((await collection.POST(json("POST", { projectId, name: "A" }))).status).toBe(404);
    expect(createBrandGroup).not.toHaveBeenCalled();
  });

  it("creates, audits, and maps a name clash to 409", async () => {
    getProject.mockResolvedValue({ id: projectId });
    createBrandGroup.mockResolvedValueOnce({ ok: true, group: { id: uuid, name: "Us", kind: "own" } });
    const ok = await collection.POST(json("POST", { projectId, name: "Us", kind: "own" }));
    expect(ok.status).toBe(200);
    expect(recordAuditLog).toHaveBeenCalledWith({}, "org-1", expect.objectContaining({ action: "brand_group.created" }));

    createBrandGroup.mockResolvedValueOnce({ ok: false, reason: "name_taken" });
    expect((await collection.POST(json("POST", { projectId, name: "Us" }))).status).toBe(409);
  });
});

describe("PATCH/DELETE /api/brand-groups/[id]", () => {
  beforeEach(() => requirePermission.mockResolvedValue(ctx));

  it("requires at least one field", async () => {
    expect((await item.PATCH(json("PATCH", {}), params(uuid))).status).toBe(400);
  });

  it("maps repository outcomes", async () => {
    updateBrandGroup.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await item.PATCH(json("PATCH", { name: "Z" }), params(uuid))).status).toBe(404);
    updateBrandGroup.mockResolvedValueOnce({ ok: false, reason: "name_taken" });
    expect((await item.PATCH(json("PATCH", { name: "Z" }), params(uuid))).status).toBe(409);
    updateBrandGroup.mockResolvedValueOnce({ ok: true, group: {} });
    expect((await item.PATCH(json("PATCH", { color: "violet" }), params(uuid))).status).toBe(200);

    deleteBrandGroup.mockResolvedValueOnce(false);
    expect((await item.DELETE(json("DELETE"), params(uuid))).status).toBe(404);
    deleteBrandGroup.mockResolvedValueOnce(true);
    expect((await item.DELETE(json("DELETE"), params(uuid))).status).toBe(200);
    expect(updateBrandGroup).toHaveBeenCalledWith({}, "org-1", uuid, { color: "violet" });
  });
});

describe("POST /api/brand-groups/assign", () => {
  beforeEach(() => requirePermission.mockResolvedValue(ctx));

  it("validates ids and maps outcomes (including removing from a group)", async () => {
    expect((await assign.POST(json("POST", { queryId: "x", brandGroupId: null }))).status).toBe(400);

    setQueryBrandGroup.mockResolvedValueOnce("query_not_found");
    expect((await assign.POST(json("POST", { queryId: uuid, brandGroupId: uuid }))).status).toBe(404);
    setQueryBrandGroup.mockResolvedValueOnce("group_not_found");
    expect((await assign.POST(json("POST", { queryId: uuid, brandGroupId: uuid }))).status).toBe(404);
    setQueryBrandGroup.mockResolvedValueOnce("project_mismatch");
    expect((await assign.POST(json("POST", { queryId: uuid, brandGroupId: uuid }))).status).toBe(409);
    setQueryBrandGroup.mockResolvedValueOnce("ok");
    expect((await assign.POST(json("POST", { queryId: uuid, brandGroupId: null }))).status).toBe(200);
    expect(setQueryBrandGroup).toHaveBeenLastCalledWith({}, "org-1", uuid, null);
  });
});
