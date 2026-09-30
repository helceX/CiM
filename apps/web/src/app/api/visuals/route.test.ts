import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getProject = vi.fn();
const createSavedVisual = vi.fn();
const listSavedVisuals = vi.fn();
const updateSavedVisual = vi.fn();
const deleteSavedVisual = vi.fn();
const runVisual = vi.fn();
const recordAuditLog = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/tenant", () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
vi.mock("@cim/db", () => ({
  db: {},
  getProject: (...a: unknown[]) => getProject(...a),
  createSavedVisual: (...a: unknown[]) => createSavedVisual(...a),
  listSavedVisuals: (...a: unknown[]) => listSavedVisuals(...a),
  updateSavedVisual: (...a: unknown[]) => updateSavedVisual(...a),
  deleteSavedVisual: (...a: unknown[]) => deleteSavedVisual(...a),
  runVisual: (...a: unknown[]) => runVisual(...a),
  recordAuditLog: (...a: unknown[]) => recordAuditLog(...a),
}));

const collection = await import("./route");
const preview = await import("./preview/route");
const item = await import("./[id]/route");

const ctx = { organizationId: "org-1", userId: "user-1" };
const uuid = "22222222-2222-4222-8222-222222222222";
const spec = { measure: "mentions", dimension: "day" };

const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api/visuals", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const forbidden = () => {
  throw new Error("FORBIDDEN");
};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
});

describe("visuals API permissions", () => {
  it("rejects writes without monitoring:write and touches nothing", async () => {
    requirePermission.mockImplementation(forbidden);
    expect((await collection.POST(json("POST", { name: "X", spec }))).status).toBe(403);
    expect((await item.PATCH(json("PATCH", { name: "Y" }), params(uuid))).status).toBe(403);
    expect((await item.DELETE(json("DELETE"), params(uuid))).status).toBe(403);
    expect(createSavedVisual).not.toHaveBeenCalled();
    expect(updateSavedVisual).not.toHaveBeenCalled();
    expect(deleteSavedVisual).not.toHaveBeenCalled();
  });

  it("rejects reads without monitoring:read and answers 401 when signed out", async () => {
    requirePermission.mockImplementation(forbidden);
    expect((await collection.GET()).status).toBe(403);
    expect((await preview.POST(json("POST", spec))).status).toBe(403);
    expect(runVisual).not.toHaveBeenCalled();
    requirePermission.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await collection.GET()).status).toBe(401);
  });
});

describe("visuals API behaviour", () => {
  beforeEach(() => requirePermission.mockResolvedValue(ctx));

  it("creates a visual for the caller's org, verifies the project, and audits", async () => {
    getProject.mockResolvedValue({ id: uuid });
    createSavedVisual.mockResolvedValue({ id: "v1", name: "Volume", kind: "chart" });
    const res = await collection.POST(
      json("POST", { name: "Volume", spec: { ...spec, filters: { projectId: uuid } }, organizationId: "org-evil" }),
    );
    expect(res.status).toBe(200);
    expect(getProject).toHaveBeenCalledWith({}, "org-1", uuid);
    const [, orgId, input] = createSavedVisual.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(input.createdBy).toBe("user-1");
    expect(input).not.toHaveProperty("organizationId");
    expect(recordAuditLog.mock.calls[0]![2].action).toBe("visual.created");
  });

  it("404s a project that is not in the caller's organization", async () => {
    getProject.mockResolvedValue(undefined);
    const res = await collection.POST(json("POST", { name: "V", spec: { ...spec, filters: { projectId: uuid } } }));
    expect(res.status).toBe(404);
    expect(createSavedVisual).not.toHaveBeenCalled();
  });

  it("rejects a malformed or smuggled spec", async () => {
    expect((await collection.POST(json("POST", { name: "V", spec: { ...spec, sql: "select 1" } }))).status).toBe(400);
    expect((await collection.POST(json("POST", { name: "V", spec: { ...spec, measure: "x; drop" } }))).status).toBe(400);
    expect((await preview.POST(json("POST", { ...spec, periodDays: 4 }))).status).toBe(400);
    expect(createSavedVisual).not.toHaveBeenCalled();
    expect(runVisual).not.toHaveBeenCalled();
  });

  it("previews under the caller's organization and rate-limits per organization", async () => {
    runVisual.mockResolvedValue({ rows: [{ label: "2026-09-30", value: 3 }], truncated: false });
    const res = await preview.POST(json("POST", spec));
    expect(res.status).toBe(200);
    expect(runVisual.mock.calls[0]![1]).toBe("org-1");
    expect(checkRateLimit.mock.calls[0]![0]).toBe("visual-preview:org-1");

    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await preview.POST(json("POST", spec))).status).toBe(429);
  });

  it("does not leak internals when a preview query fails", async () => {
    runVisual.mockRejectedValue(new Error('relation "secret_table" does not exist'));
    const res = await preview.POST(json("POST", spec));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  });

  it("answers 409 when pinning beyond the dashboard limit and audits a successful pin", async () => {
    updateSavedVisual.mockResolvedValue({ ok: false, reason: "pin_limit" });
    const limited = await item.PATCH(json("PATCH", { pinned: true }), params(uuid));
    expect(limited.status).toBe(409);
    expect(recordAuditLog).not.toHaveBeenCalled();

    updateSavedVisual.mockResolvedValue({ ok: true, visual: { name: "V" } });
    expect((await item.PATCH(json("PATCH", { pinned: true }), params(uuid))).status).toBe(200);
    expect(recordAuditLog.mock.calls[0]![2].metadata).toEqual({ name: "V", pinned: true });
  });

  it("maps a missing visual to 404 on update and delete (other org's ids look the same)", async () => {
    updateSavedVisual.mockResolvedValue({ ok: false, reason: "not_found" });
    deleteSavedVisual.mockResolvedValue(false);
    expect((await item.PATCH(json("PATCH", { name: "Z" }), params(uuid))).status).toBe(404);
    expect((await item.DELETE(json("DELETE"), params(uuid))).status).toBe(404);
    expect(updateSavedVisual.mock.calls[0]![1]).toBe("org-1");
    expect(deleteSavedVisual.mock.calls[0]![1]).toBe("org-1");
  });
});
