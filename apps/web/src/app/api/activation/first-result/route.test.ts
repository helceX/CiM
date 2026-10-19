import { beforeEach, expect, it, vi } from "vitest";

const { requireOrgContext, checkRateLimit, recordFirstResultView } = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  checkRateLimit: vi.fn(),
  recordFirstResultView: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({ requireOrgContext }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@cim/db", () => ({ db: {}, recordFirstResultView }));
import { POST } from "./route";

const mentionId = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown) =>
  new Request("http://localhost/api/activation/first-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  requireOrgContext.mockResolvedValue({
    organizationId: "authenticated-org",
    userId: "authenticated-user",
  });
  checkRateLimit.mockResolvedValue({ allowed: true });
});
it("requires a session before recording activity", async () => {
  requireOrgContext.mockRejectedValue(new Error("UNAUTHENTICATED"));
  expect((await POST(request({ mentionId }))).status).toBe(401);
  expect(recordFirstResultView).not.toHaveBeenCalled();
});
it("rejects invalid mentions without writing an event", async () => {
  expect((await POST(request({ mentionId: "invalid" }))).status).toBe(400);
  expect(recordFirstResultView).not.toHaveBeenCalled();
});
it("takes the tenant and user from the session, never the request", async () => {
  expect(
    (
      await POST(
        request({ mentionId, organizationId: "other-org", userId: "other-user" }),
      )
    ).status,
  ).toBe(200);
  expect(recordFirstResultView).toHaveBeenCalledWith(
    {},
    "authenticated-org",
    "authenticated-user",
    mentionId,
  );
});
it("does not record activity after the rate limit is reached", async () => {
  checkRateLimit.mockResolvedValue({ allowed: false });
  expect((await POST(request({ mentionId }))).status).toBe(429);
  expect(recordFirstResultView).not.toHaveBeenCalled();
});
