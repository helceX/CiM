import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getTurnstileSiteKey, isTurnstileEnabled, rejectIfNotHuman, verifyTurnstileToken } =
  await import("./turnstile");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("TURNSTILE_SITE_KEY", "");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function enable() {
  vi.stubEnv("TURNSTILE_SITE_KEY", "site");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
}
const ok = (success: boolean) => ({ ok: true, json: async () => ({ success }) });

describe("Turnstile (off by default)", () => {
  it("is disabled unless BOTH keys are set, and then never blocks or calls out", async () => {
    expect(isTurnstileEnabled()).toBe(false);
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    expect(isTurnstileEnabled()).toBe(false);
    expect(getTurnstileSiteKey()).toBeNull();
    expect(await rejectIfNotHuman({}, "1.2.3.4")).toBeNull();
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Turnstile (enabled)", () => {
  beforeEach(enable);

  it("exposes only the site key, never the secret", () => {
    expect(getTurnstileSiteKey()).toBe("site");
  });

  it("rejects a missing or oversized token without calling Cloudflare", async () => {
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(false);
    expect(await verifyTurnstileToken("", "1.2.3.4")).toBe(false);
    expect(await verifyTurnstileToken("x".repeat(5000), "1.2.3.4")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only an explicit success and sends secret, token and IP", async () => {
    fetchMock.mockResolvedValueOnce(ok(true));
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    const sent = init.body as URLSearchParams;
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("1.2.3.4");

    fetchMock.mockResolvedValueOnce(ok(false));
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);
  });

  it("fails closed when Cloudflare is unreachable or errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: true }) });
    expect(await verifyTurnstileToken("tok", "1.2.3.4")).toBe(false);
  });

  it("rejectIfNotHuman returns a 400 captcha_failed response, or null when it passes", async () => {
    const blocked = await rejectIfNotHuman({ email: "a@b.c" }, "1.2.3.4");
    expect(blocked?.status).toBe(400);
    expect(await blocked?.json()).toMatchObject({ code: "captcha_failed" });

    fetchMock.mockResolvedValueOnce(ok(true));
    expect(await rejectIfNotHuman({ turnstileToken: "tok" }, "1.2.3.4")).toBeNull();
  });
});
