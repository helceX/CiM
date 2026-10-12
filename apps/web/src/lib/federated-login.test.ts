import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { openLoginValue, sealLoginValue, safeLoginNext, exchangeLogin, loginAuthorizeUrl, configuredLoginProviders } = await import("./federated-login");
const secret = "s".repeat(40);
const flow = { provider: "google" as const, state: "state", verifier: "verifier", userId: null, next: "/dashboard", expires: Date.now() + 60000 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("federated identity boundary", () => {
  it("encrypts pending identities and rejects tampering, wrong secrets and expired transactions", () => {
    const sealed = sealLoginValue({ email: "private@example.com", expires: Date.now() + 10000 }, secret);
    expect(sealed).not.toContain("private");
    expect(openLoginValue(sealed, secret)).toMatchObject({ email: "private@example.com" });
    expect(openLoginValue(sealed + "a", secret)).toBeNull();
    expect(openLoginValue(sealed, "wrong")).toBeNull();
    expect(openLoginValue(sealLoginValue({ expires: 1 }, secret), secret)).toBeNull();
  });
  it("refuses external, protocol-relative and API redirects", () => {
    for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "/api/auth/logout", "/dashboard\\evil", "/dashboard\n"]) expect(safeLoginNext(next)).toBe("/dashboard");
    expect(safeLoginNext("/opportunities?since=7")).toBe("/opportunities?since=7");
  });
  it("requires both credentials and isolates login from YouTube access", () => {
    vi.stubEnv("LOGIN_GOOGLE_CLIENT_ID", "client"); vi.stubEnv("LOGIN_GOOGLE_CLIENT_SECRET", "secret");
    expect(configuredLoginProviders()).toContain("google");
    const url = new URL(loginAuthorizeUrl(flow, "https://mediaory.io/api/auth/federated/google/callback"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.href).not.toContain("secret");
  });
  it("accepts Google's verified userinfo from the exchanged token, not browser claims", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "opaque" })).mockResolvedValueOnce(Response.json({ sub: "google-id", email: "USER@example.com", email_verified: true, name: "User Name" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await exchangeLogin(flow, "code", "https://mediaory.io/callback")).toMatchObject({ subject: "google-id", email: "user@example.com", emailVerified: true });
    expect(fetcher.mock.calls[1]?.[1].headers.authorization).toBe("Bearer opaque");
  });
  it("does not trust Microsoft's email as verified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "opaque" })).mockResolvedValueOnce(Response.json({ sub: "ms-id", email: "someone@example.com", email_verified: true })));
    expect(await exchangeLogin({ ...flow, provider: "microsoft" }, "code", "https://mediaory.io/callback")).toMatchObject({ emailVerified: false });
  });
  it("requires a verified primary GitHub email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "opaque" })).mockResolvedValueOnce(Response.json({ id: 123, email: "unverified@example.com" })).mockResolvedValueOnce(Response.json([{ email: "unverified@example.com", primary: true, verified: false }])));
    await expect(exchangeLogin({ ...flow, provider: "github" }, "code", "https://mediaory.io/callback")).rejects.toThrow("Verified email required");
  });
  it("fails closed on rejected token exchanges", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_grant" })));
    await expect(exchangeLogin(flow, "code", "https://mediaory.io/callback")).rejects.toThrow();
  });
  it("reports a safe provider stage without leaking its private response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private token and email", { status: 403 })));
    await expect(exchangeLogin(flow, "private-code", "https://mediaory.io/callback")).rejects.toMatchObject({ reference: "token_http_403", message: "Login provider unavailable" });
  });
});
