import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getMonitoringCheck = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/tenant", () => ({ requirePermission: (...args: unknown[]) => requirePermission(...args) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }));
vi.mock("@cim/db", () => ({
  db: {},
  getMonitoringCheck: (...args: unknown[]) => getMonitoringCheck(...args),
}));

const { GET } = await import("./route");

const params = (id = "q-1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/monitoring/q-1/check");

const check = {
  query: { id: "q-1", name: "BTM watch", sourceTypes: ["news"], regionScopes: [], createdAt: new Date(), updatedAt: new Date(), latestMentionAt: new Date("2026-10-07T10:00:00Z") },
  sources: { inScope: 5200, active: 6900 },
  crawl: { minutesSinceLastScan: 12 },
  stories: { last24h: 41_000 },
  keywords: [{ term: "BTM", last24h: 0, last7d: 3 }],
  mentions: { last24h: 0, last7d: 1, total: 4 },
  alerts: { active: 0, total: 0 },
  lastAlertAt: null,
  missed: { count: 0, checked: 3 },
  missedSamples: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ organizationId: "org-1", userId: "u-1" });
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
  getMonitoringCheck.mockResolvedValue(check);
});

describe("GET /api/monitoring/[id]/check", () => {
  it("needs monitoring:read and a session", async () => {
    requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await GET(request(), params())).status).toBe(403);
    requirePermission.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    expect((await GET(request(), params())).status).toBe(401);
    expect(getMonitoringCheck).not.toHaveBeenCalled();
  });

  it("checks only this organization's monitoring and answers 404 for any other", async () => {
    getMonitoringCheck.mockResolvedValueOnce(null);
    const response = await GET(request(), params("someone-elses"));
    expect(response.status).toBe(404);
    expect(getMonitoringCheck).toHaveBeenCalledWith({}, "org-1", "someone-elses");
  });

  it("returns the measurements with a plain-language verdict", async () => {
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verdict.level).toBe("quiet");
    expect(body.verdict.headline).toContain("41,000 stories from 5,200 sources");
    expect(body.keywords).toEqual([{ term: "BTM", last24h: 0, last7d: 3 }]);
    expect(body.query.latestMentionAt).toBe("2026-10-07T10:00:00.000Z");
    expect(body.query).not.toHaveProperty("createdAt");
    // No alert rule: the verdict says the monitoring sends no notifications.
    expect(body.alerts).toEqual({ active: 0, total: 0, lastFiredAt: null });
    expect(body.verdict.advice.at(-1)).toContain("No alert rule is set on this monitoring");
  });

  it("rate-limits the check per organization", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const response = await GET(request(), params());
    expect(response.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("monitoring-check:org-1", expect.objectContaining({ limit: 30 }));
    expect(getMonitoringCheck).not.toHaveBeenCalled();
  });

  it("says so when the database could not answer in time", async () => {
    getMonitoringCheck.mockRejectedValueOnce(new Error("canceling statement due to statement timeout"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(request(), params());
    spy.mockRestore();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("took too long");
  });
});
