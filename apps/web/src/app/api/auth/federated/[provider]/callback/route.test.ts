import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { store, findIdentity, findEmail, link, session, current, exchange, open } = vi.hoisted(() => ({ store: { get: vi.fn(), delete: vi.fn(), set: vi.fn() }, findIdentity: vi.fn(), findEmail: vi.fn(), link: vi.fn(), session: vi.fn(), current: vi.fn(), exchange: vi.fn(), open: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@cim/config", () => ({ getEnv: () => ({ APP_URL: "https://mediaory.io", SESSION_SECRET: "secret", NODE_ENV: "production" }) }));
vi.mock("@cim/db", () => ({ db: {}, findLoginIdentity: findIdentity, findUserByEmail: findEmail, linkLoginIdentity: link }));
vi.mock("@/lib/session", () => ({ createUserSession: session, getCurrentUser: current }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }), clientIpFrom: () => "test" }));
vi.mock("@/lib/federated-login", async () => ({ ...await import("../../../../../../lib/federated-login"), exchangeLogin: exchange, openLoginValue: open }));
const { GET } = await import("./route");
const request = (state = "valid") => new Request(`https://mediaory.io/api/auth/federated/google/callback?code=code&state=${state}`);
const context = { params: Promise.resolve({ provider: "google" }) };
beforeEach(() => {
  vi.resetAllMocks();
  open.mockReturnValue({ provider: "google", state: "valid", verifier: "verifier", userId: null, next: "/dashboard" });
  exchange.mockResolvedValue({ provider: "google", subject: "subject", email: "user@example.com", emailVerified: true, name: "User" });
});
it("rejects a forged state before contacting the provider", async () => {
  expect((await GET(request("forged"), context)).headers.get("location")).toContain("federated=failed");
  expect(exchange).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
});
it("does not merge an existing email into a new provider identity", async () => {
  findEmail.mockResolvedValue({ id: "administrator" });
  expect((await GET(request(), context)).headers.get("location")).toContain("federated=link");
  expect(link).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
});
it("rejects deleted or unverified linked accounts", async () => {
  findIdentity.mockResolvedValue({ id: "user", deletedAt: new Date(), emailVerifiedAt: new Date() });
  expect((await GET(request(), context)).headers.get("location")).toContain("federated=verify");
  expect(session).not.toHaveBeenCalled();
});
it("logs in by stable provider identity and creates the normal revocable session", async () => {
  findIdentity.mockResolvedValue({ id: "user", deletedAt: null, emailVerifiedAt: new Date() });
  expect((await GET(request(), context)).headers.get("location")).toBe("https://mediaory.io/dashboard");
  expect(session).toHaveBeenCalledWith("user", expect.any(Object));
});
it("requires the same signed-in user to remain present when linking", async () => {
  open.mockReturnValue({ provider: "google", state: "valid", userId: "owner" });
  current.mockResolvedValue({ id: "different", emailVerifiedAt: new Date() });
  expect((await GET(request(), context)).headers.get("location")).toContain("failed"); expect(link).not.toHaveBeenCalled();
});
it("stores only an encrypted short-lived registration identity, no provider tokens", async () => {
  expect((await GET(request(), context)).headers.get("location")).toBe("https://mediaory.io/register?federated=1");
  expect(store.set).toHaveBeenCalledWith("cim_login_pending", expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, maxAge: 600 }));
  expect(session).not.toHaveBeenCalled();
});
it("carries the server-held blog source through OAuth into the encrypted pending registration", async () => {
  open.mockReturnValue({ provider: "google", state: "valid", verifier: "verifier", userId: null, next: "/dashboard", blogSource: "medya-takibi-nedir" });
  await GET(request(), context);
  const { openLoginValue } = await import("../../../../../../lib/federated-login");
  expect(openLoginValue(store.set.mock.calls[0]?.[1], "secret")).toMatchObject({ blogSource: "medya-takibi-nedir", subject: "subject" });
});
