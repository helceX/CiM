import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const createTakedownRequest = vi.fn();
const listPlatformAdminEmails = vi.fn();
const sendEmail = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  clientIpFrom: () => "203.0.113.5",
}));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/turnstile", () => ({ rejectIfNotHuman: async () => null }));
vi.mock("@cim/config", () => ({ getEnv: () => ({ APP_URL: "https://mediaory.io" }) }));
vi.mock("@cim/db", () => ({
  db: {},
  createTakedownRequest: (...a: unknown[]) => createTakedownRequest(...a),
  listPlatformAdminEmails: (...a: unknown[]) => listPlatformAdminEmails(...a),
}));

const { POST } = await import("./route");

const valid = {
  requesterName: "Ayşe Editör",
  requesterEmail: "Ayse@Pub.Example",
  publisher: "Pub Gazetesi",
  targets: "pub.example ve tüm alt adresler",
  message: "Lütfen kaldırın.",
  confirmAuthority: true,
};
const post = (body: unknown) =>
  POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  createTakedownRequest.mockResolvedValue("id-1");
  listPlatformAdminEmails.mockResolvedValue(["admin@mediaory.io"]);
});

describe("POST /api/takedown (public)", () => {
  it("stores the request, normalises the e-mail, and notifies every platform admin", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const stored = createTakedownRequest.mock.calls[0]![1] as Record<string, unknown>;
    expect(stored.requesterEmail).toBe("ayse@pub.example");
    expect(stored).not.toHaveProperty("confirmAuthority");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ toEmail: "admin@mediaory.io", kind: "takedown_notice" });
  });

  it("requires the authority confirmation and a real e-mail", async () => {
    expect((await post({ ...valid, confirmAuthority: false })).status).toBe(400);
    expect((await post({ ...valid, requesterEmail: "nope" })).status).toBe(400);
    expect((await post({ ...valid, targets: "" })).status).toBe(400);
    expect(createTakedownRequest).not.toHaveBeenCalled();
  });

  it("is rate limited per IP", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await post(valid)).status).toBe(429);
    expect(createTakedownRequest).not.toHaveBeenCalled();
  });

  it("still succeeds when the admin notice cannot be sent", async () => {
    sendEmail.mockRejectedValueOnce(new Error("queue down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(valid)).status).toBe(201);
    expect(createTakedownRequest).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
