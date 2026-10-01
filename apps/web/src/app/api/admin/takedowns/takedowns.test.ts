import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSuperAdmin = vi.fn();
const closeTakedownRequest = vi.fn();
const blockDomain = vi.fn();
const unblockDomain = vi.fn();

vi.mock("@/lib/admin", () => ({ requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a) }));
vi.mock("@cim/db", () => ({
  db: {},
  closeTakedownRequest: (...a: unknown[]) => closeTakedownRequest(...a),
  blockDomain: (...a: unknown[]) => blockDomain(...a),
  unblockDomain: (...a: unknown[]) => unblockDomain(...a),
}));

const resolve = await import("./[id]/route");
const blocked = await import("../blocked-domains/route");
const unblock = await import("../blocked-domains/[id]/route");

const uuid = "33333333-3333-4333-8333-333333333333";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "admin-1", email: "a@b.c" });
  closeTakedownRequest.mockResolvedValue(true);
  blockDomain.mockResolvedValue({ domain: "pub.example", sourcesPaused: 2, articlesDeleted: 9 });
});

describe("admin takedown API", () => {
  it("is 404 for everyone but platform admins", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NOT_SUPER_ADMIN"));
    expect((await resolve.POST(json({ action: "resolve" }), params(uuid))).status).toBe(404);
    expect((await blocked.POST(json({ domain: "a.example", reason: "x" }))).status).toBe(404);
    expect((await unblock.DELETE(json({}), params(uuid))).status).toBe(404);
    expect(blockDomain).not.toHaveBeenCalled();
  });

  it("block_and_purge closes the request and blocks the domain with purge", async () => {
    const res = await resolve.POST(json({ action: "block_and_purge", domain: "https://WWW.Pub.example/path", note: "asked" }), params(uuid));
    expect(res.status).toBe(200);
    expect(closeTakedownRequest.mock.calls[0]![2]).toMatchObject({ status: "resolved", userId: "admin-1" });
    expect(blockDomain.mock.calls[0]![1]).toMatchObject({ domain: "www.pub.example", purge: true });
  });

  it("block (without purge) never purges; resolve/reject never block", async () => {
    await resolve.POST(json({ action: "block", domain: "pub.example" }), params(uuid));
    expect(blockDomain.mock.calls[0]![1]).toMatchObject({ purge: false });
    blockDomain.mockClear();
    await resolve.POST(json({ action: "reject" }), params(uuid));
    await resolve.POST(json({ action: "resolve" }), params(uuid));
    expect(blockDomain).not.toHaveBeenCalled();
    expect(closeTakedownRequest.mock.calls.at(-2)![2]).toMatchObject({ status: "rejected" });
  });

  it("needs a domain to block, and answers 409 (without blocking) for an already-handled request", async () => {
    expect((await resolve.POST(json({ action: "block" }), params(uuid))).status).toBe(400);
    closeTakedownRequest.mockResolvedValueOnce(false);
    expect((await resolve.POST(json({ action: "block", domain: "pub.example" }), params(uuid))).status).toBe(409);
    expect(blockDomain).not.toHaveBeenCalled();
  });

  it("validates ids and domains", async () => {
    expect((await resolve.POST(json({ action: "resolve" }), params("nope"))).status).toBe(404);
    expect((await blocked.POST(json({ domain: "not a domain", reason: "x" }))).status).toBe(400);
    expect((await blocked.POST(json({ domain: "ok.example", reason: "" }))).status).toBe(400);
    unblockDomain.mockResolvedValueOnce(false);
    expect((await unblock.DELETE(json({}), params(uuid))).status).toBe(404);
  });
});
