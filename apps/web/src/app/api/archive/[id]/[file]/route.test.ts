import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getArchiveRun = vi.fn();
const getArchiveStore = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/tenant", () => ({ requirePermission: (...args: unknown[]) => requirePermission(...args) }));
vi.mock("@/lib/archive", () => ({ getArchiveStore: () => getArchiveStore() }));
vi.mock("@cim/db", () => ({ db: {}, getArchiveRun: (...args: unknown[]) => getArchiveRun(...args) }));

const { GET } = await import("./route");

const ID = "11111111-1111-4111-8111-111111111111";
const call = (id: string, file: string) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ id, file }) });
const run = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  status: "ready",
  files: [{ name: "archive.html", key: "orgs/o/weekly/2026-W40/archive.html", bytes: 10, contentType: "text/html" }],
  ...overrides,
});

describe("GET /api/archive/[id]/[file]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ organizationId: "org-1", permissions: ["reports:read"] });
    getArchiveStore.mockReturnValue({ presignGet });
    presignGet.mockResolvedValue("https://signed.example/archive.html?sig=1");
  });

  it("401s when not signed in and 403s without reports:read", async () => {
    requirePermission.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    expect((await call(ID, "archive.html")).status).toBe(401);
    requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await call(ID, "archive.html")).status).toBe(403);
  });

  it("redirects to a short-lived signed address for a file of this org's ready run", async () => {
    getArchiveRun.mockResolvedValue(run());
    const response = await call(ID, "archive.html");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.example/archive.html?sig=1");
    expect(getArchiveRun).toHaveBeenCalledWith({}, "org-1", ID);
    expect(presignGet).toHaveBeenCalledWith("orgs/o/weekly/2026-W40/archive.html", 300);
  });

  it("404s for unknown ids, other orgs' runs, unlisted file names and unfinished runs", async () => {
    expect((await call("not-a-uuid", "archive.html")).status).toBe(404);
    getArchiveRun.mockResolvedValueOnce(undefined);
    expect((await call(ID, "archive.html")).status).toBe(404);
    getArchiveRun.mockResolvedValueOnce(run());
    expect((await call(ID, "../secret.txt")).status).toBe(404);
    getArchiveRun.mockResolvedValueOnce(run({ status: "building" }));
    expect((await call(ID, "archive.html")).status).toBe(404);
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("503s when storage is not configured", async () => {
    getArchiveRun.mockResolvedValue(run());
    getArchiveStore.mockReturnValue(null);
    expect((await call(ID, "archive.html")).status).toBe(503);
  });
});
