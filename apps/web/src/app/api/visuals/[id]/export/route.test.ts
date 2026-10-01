import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getSavedVisual = vi.fn();
const runVisual = vi.fn();

vi.mock("@/lib/tenant", () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock("@cim/db", () => ({
  db: {},
  getSavedVisual: (...a: unknown[]) => getSavedVisual(...a),
  runVisual: (...a: unknown[]) => runVisual(...a),
}));

const { GET } = await import("./route");

const uuid = "22222222-2222-4222-8222-222222222222";
const request = new Request("http://localhost/api/visuals/x/export");
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const spec = { measure: "mentions", dimension: "source" };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ organizationId: "org-1", userId: "u1" });
});

describe("visual CSV export", () => {
  it("requires monitoring:read", async () => {
    requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await GET(request, params(uuid))).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("monitoring:read");
    expect(runVisual).not.toHaveBeenCalled();
  });

  it("404s a malformed id without touching the database, and a visual outside the org", async () => {
    expect((await GET(request, params("../../etc/passwd"))).status).toBe(404);
    expect(getSavedVisual).not.toHaveBeenCalled();
    getSavedVisual.mockResolvedValue(undefined);
    expect((await GET(request, params(uuid))).status).toBe(404);
    expect(getSavedVisual.mock.calls[0]![1]).toBe("org-1");
  });

  it("returns a CSV attachment with a safe filename and formula-neutral cells", async () => {
    getSavedVisual.mockResolvedValue({ id: uuid, name: 'Q3 "Board" / déck\r\nX-Evil: 1', spec });
    runVisual.mockResolvedValue({ rows: [{ label: "=cmd|' /C calc'!A0", value: 2 }], truncated: false });
    const res = await GET(request, params(uuid));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition).toMatch(/^attachment; filename="[a-z0-9-]+\.csv"$/);
    expect(disposition).not.toMatch(/[\r\n]/);
    const body = await res.text();
    expect(body).toContain(`"'=cmd|' /C calc'!A0",2`);
  });

  it("refuses a stored spec that no longer validates", async () => {
    getSavedVisual.mockResolvedValue({ id: uuid, name: "Old", spec: { measure: "nope" } });
    expect((await GET(request, params(uuid))).status).toBe(422);
    expect(runVisual).not.toHaveBeenCalled();
  });

  it("returns a real XLSX workbook for ?format=xlsx", async () => {
    getSavedVisual.mockResolvedValue({ id: uuid, name: "Board volume", spec });
    runVisual.mockResolvedValue({ rows: [{ label: "=1+1", value: 2 }], truncated: false });
    const res = await GET(new Request("http://localhost/api/visuals/x/export?format=xlsx"), params(uuid));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="board-volume.xlsx"');

    // A real workbook is a zip container; its contents are covered in packages/reports (renderVisualXlsx).
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
