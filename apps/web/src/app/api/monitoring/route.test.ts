import { beforeEach, describe, expect, it, vi } from "vitest";

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
const backfillMentionsForQuery = vi.fn();
const createNotifyRuleForQuery = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  backfillMentionsForQuery: (...args: unknown[]) => backfillMentionsForQuery(...args),
  getProject: (...args: unknown[]) => getProject(...args),
  createNotifyRuleForQuery: (...args: unknown[]) => createNotifyRuleForQuery(...args),
  createMonitoringQueryWithPlanLimit: (...args: unknown[]) => createMonitoringQueryWithPlanLimit(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", isPlatformSuperAdmin: false });
  backfillMentionsForQuery.mockResolvedValue({ scanned: 0, created: 0 });
  createNotifyRuleForQuery.mockResolvedValue({ id: "rule-1" });
});

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
      query: { id: "query-1", sourceTypes: ["news"] },
    });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(createMonitoringQueryWithPlanLimit).toHaveBeenCalled();
  });
});

describe("POST /api/monitoring — plan limit", () => {
  function allowCreate() {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId });
  }

  it("never caps a platform operator", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", isPlatformSuperAdmin: true });
    allowCreate();
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({ ok: true, query: { id: "query-1", sourceTypes: ["news"] } });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(createMonitoringQueryWithPlanLimit.mock.calls[0]?.[3]).toEqual({ unlimited: true });
  });

  it("applies the plan cap to everyone else and points to the upgrade page", async () => {
    allowCreate();
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({ ok: false, limit: 1 });

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(409);
    expect(createMonitoringQueryWithPlanLimit.mock.calls[0]?.[3]).toEqual({ unlimited: false });
    expect(await response.json()).toMatchObject({ code: "plan_limit", upgradeUrl: "/settings?tab=billing" });
  });

  it("backfills stored stories after saving, and a backfill failure does not undo the save", async () => {
    allowCreate();
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({ ok: true, query: { id: "query-1", sourceTypes: ["news"] } });
    backfillMentionsForQuery.mockRejectedValueOnce(new Error("boom"));

    const response = await POST(makeRequest(basePayload));
    expect(response.status).toBe(200);
    expect(backfillMentionsForQuery).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/monitoring — scope and concepts", () => {
  it("stores the region scope and the alias groups, adding names that were not keywords yet", async () => {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId });
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({ ok: true, query: { id: "query-1", sourceTypes: ["news"], regionScopes: ["TR"] } });

    const response = await POST(
      makeRequest({
        ...basePayload,
        include: ["BTM"],
        aliasGroups: [["BTM", "Bilgiyi Ticarileştirme Merkezi"], ["solo"]],
        regionScopes: ["tr", "nowhere"],
      }),
    );
    expect(response.status).toBe(200);
    const created = createMonitoringQueryWithPlanLimit.mock.calls[0]?.[2];
    expect(created.regionScopes).toEqual(["TR"]);
    expect(created.queryAst.aliasGroups).toEqual([["BTM", "Bilgiyi Ticarileştirme Merkezi"]]);
    expect(created.queryAst.include).toEqual(["BTM", "Bilgiyi Ticarileştirme Merkezi"]);
    expect(backfillMentionsForQuery.mock.calls[0]?.[2]).toMatchObject({ regionScopes: ["TR"] });
  });
});

describe("POST /api/monitoring — what the person wants from it", () => {
  function allowCreate() {
    requirePermission.mockResolvedValueOnce({ organizationId: "org-1", userId: "user-1" });
    getProject.mockResolvedValueOnce({ id: basePayload.projectId });
    createMonitoringQueryWithPlanLimit.mockResolvedValueOnce({
      ok: true,
      query: { id: "query-1", name: "Brand watch", sourceTypes: ["news"], regionScopes: [], trackingTarget: "company" },
    });
  }

  it("keeps the goals, the focus and the person's own words on the query", async () => {
    allowCreate();
    const response = await POST(
      makeRequest({ ...basePayload, intent: { goals: ["risk", "opportunity", "bogus"], focus: "essentials", signalWords: ["Q3", "q3"] } }),
    );
    expect(response.status).toBe(200);
    expect(createMonitoringQueryWithPlanLimit.mock.calls[0]?.[2].queryAst.intent).toEqual({
      goals: ["risk", "opportunity"],
      focus: "essentials",
      signalWords: ["Q3"],
    });
    expect(backfillMentionsForQuery.mock.calls[0]?.[2]).toMatchObject({ trackingTarget: "company" });
  });

  it("turns 'tell me about important stories' into an alert rule, in-app and by e-mail when asked", async () => {
    allowCreate();
    const response = await POST(makeRequest({ ...basePayload, notify: { mode: "important", email: true } }));
    expect(await response.json()).toMatchObject({ ok: true, alertRuleId: "rule-1" });
    expect(createNotifyRuleForQuery).toHaveBeenCalledWith(
      {},
      "org-1",
      expect.objectContaining({ projectId: basePayload.projectId, queryId: "query-1", createdByUserId: "user-1", monitoringName: "Brand watch", mode: "important", email: true }),
    );
  });

  it("creates no rule for 'I will look myself' or when nothing was asked", async () => {
    allowCreate();
    expect((await (await POST(makeRequest({ ...basePayload, notify: { mode: "none" } }))).json()).alertRuleId).toBeNull();
    allowCreate();
    expect((await (await POST(makeRequest(basePayload))).json()).alertRuleId).toBeNull();
    expect(createNotifyRuleForQuery).not.toHaveBeenCalled();
  });

  it("still saves the monitoring when the alert rule cannot be created", async () => {
    allowCreate();
    createNotifyRuleForQuery.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(makeRequest({ ...basePayload, notify: { mode: "every" } }));
    spy.mockRestore();
    expect(response.status).toBe(200);
    expect((await response.json()).alertRuleId).toBeNull();
  });
});
