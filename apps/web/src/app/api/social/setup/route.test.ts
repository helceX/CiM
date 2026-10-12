import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.fn();
const permission = vi.fn();
const limiter = vi.fn();
const projects = vi.fn();
const reader = vi.fn();
const policy = vi.fn();
const transaction = vi.fn();
const getQuery = vi.fn();
vi.mock("@/lib/session", () => ({ getCurrentUser: (...args: unknown[]) => session(...args) }));
vi.mock("@/lib/tenant", () => ({ requirePermission: (...args: unknown[]) => permission(...args) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => limiter(...args) }));
vi.mock("@cim/db", () => ({ db: { transaction: (...args: unknown[]) => transaction(...args) }, listProjects: (...args: unknown[]) => projects(...args), getMonitoringQuery: (...args: unknown[]) => getQuery(...args), updateMonitoringQuery: vi.fn(), checkSourcePolicy: (...args: unknown[]) => policy(...args), createSource: vi.fn(), createMonitoringQueryWithPlanLimit: vi.fn(), createAlertRule: vi.fn(), listMonitoringQueries: vi.fn(), listAlertRules: vi.fn(), recordAuditLog: vi.fn(), schema: {} }));
vi.mock("@cim/ingestion", () => ({ BlueskySearchConnector: class { read(...args: unknown[]) { return reader(...args); } }, blueskySearchUrl: (term: string) => `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(term)}`, safeFetch: vi.fn() }));
const { POST } = await import("./route");
const request = (body: unknown) => new Request("https://mediaory.io/api/social/setup", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ id: "member", isPlatformSuperAdmin: false });
  permission.mockResolvedValue({ organizationId: "org", userId: "admin", permissions: ["monitoring:write", "alerts:write"] });
  limiter.mockResolvedValue({ allowed: true });
  projects.mockResolvedValue([{ id: "project" }]);
  policy.mockResolvedValue(null);
});
describe("social setup access and preflight", () => {
  it("rejects edits of foreign monitorings before contacting a public service", async () => {
    getQuery.mockResolvedValue(undefined);
    expect((await POST(request({ brand: "Lunavera", queryId: "00000000-0000-4000-8000-000000000001" }))).status).toBe(404);
    expect(getQuery).toHaveBeenCalledWith(expect.anything(), "org", "00000000-0000-4000-8000-000000000001");
    expect(reader).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
  it("rejects oversized exclusion lists before any external lookup", async () => {
    expect((await POST(request({ brand: "Lunavera", excluded: Array.from({ length: 11 }, (_, i) => `term${i}`) }))).status).toBe(400);
    expect(reader).not.toHaveBeenCalled();
  });
  it("does not fetch or write anything for unauthenticated users", async () => {
    session.mockResolvedValue(null);
    expect((await POST(request({ brand: "Lunavera" }))).status).toBe(401);
    expect(reader).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
  it("requires both monitoring and alert permissions before configuring global sources", async () => {
    permission.mockResolvedValue({ organizationId: "org", permissions: ["monitoring:write"] });
    expect((await POST(request({ brand: "Lunavera" }))).status).toBe(403);
    expect(reader).not.toHaveBeenCalled();
  });
  it("limits setup calls and rejects invalid handles before external requests", async () => {
    limiter.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request({ brand: "Lunavera" }))).status).toBe(429);
    expect((await POST(request({ brand: "Lunavera", handle: "https://internal.example" }))).status).toBe(400);
    expect(reader).not.toHaveBeenCalled();
  });
  it("honours publisher policy before contacting Bluesky", async () => {
    policy.mockResolvedValue("blocked");
    expect((await POST(request({ brand: "Lunavera" }))).status).toBe(409);
    expect(reader).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
});
