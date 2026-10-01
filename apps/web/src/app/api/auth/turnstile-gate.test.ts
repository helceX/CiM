import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUserByEmail = vi.fn();
const sendEmail = vi.fn();
const fetchMock = vi.fn();

vi.mock("server-only", () => ({}));
// No `@/` alias under vitest — point it at the real implementation.
vi.mock("@/lib/turnstile", () => import("../../../lib/turnstile"));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 5 }),
  clientIpFrom: () => "203.0.113.9",
}));
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  verificationEmailBody: () => "body",
  passwordResetEmailBody: () => "body",
}));
vi.mock("@cim/db", () => ({
  db: {},
  asOrganizationId: (id: string) => id,
  findUserByEmail: (...a: unknown[]) => findUserByEmail(...a),
  registerOrganizationOwner: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
  recordAuditLog: vi.fn(),
}));
vi.mock("@cim/config", () => ({ getEnv: () => ({ APP_URL: "http://localhost:3000" }) }));

const register = await import("./register/route");
const reset = await import("./request-password-reset/route");
const resend = await import("./resend-verification/route");

const json = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const registerBody = {
  firstName: "A",
  lastName: "B",
  email: "a@example.com",
  companyName: "Co",
  jobTitle: "CEO",
  password: "Sup3rSecretPw",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  findUserByEmail.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth forms behind Turnstile", () => {
  it("do not change behaviour while Turnstile is off", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await reset.POST(json({ email: "a@example.com" }))).status).toBe(200);
    expect((await resend.POST(json({ email: "a@example.com" }))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse every email-sending/account-creating route without a valid token", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    for (const [route, body] of [
      [register, registerBody],
      [reset, { email: "a@example.com" }],
      [resend, { email: "a@example.com" }],
    ] as const) {
      const res = await route.POST(json(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "captcha_failed" });
    }
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lets a request through once Cloudflare confirms the token", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const res = await reset.POST(json({ email: "a@example.com", turnstileToken: "tok" }));
    expect(res.status).toBe(200);
    expect(findUserByEmail).toHaveBeenCalled();
  });
});
