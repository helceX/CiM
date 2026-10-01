import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetErrorReportingForTests,
  buildEvent,
  captureException,
  configureErrorReporting,
  isErrorReportingEnabled,
  parseDsn,
  scrubErrorText,
} from "./error-reporting";

const DSN = "https://abc123@o1.ingest.sentry.io/456";
const fetchMock = vi.fn();

beforeEach(() => {
  __resetErrorReportingForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("parseDsn", () => {
  it("builds the envelope endpoint and key", () => {
    expect(parseDsn(DSN)).toMatchObject({
      endpoint: "https://o1.ingest.sentry.io/api/456/envelope/",
      publicKey: "abc123",
    });
  });
  it("rejects http, missing key/project and garbage", () => {
    expect(parseDsn("http://k@host/1")).toBeNull();
    expect(parseDsn("https://host/1")).toBeNull();
    expect(parseDsn("https://k@host")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });
});

describe("configureErrorReporting", () => {
  it("is off without a DSN and never sends", async () => {
    expect(configureErrorReporting({ dsn: undefined, service: "web" })).toBe(false);
    expect(configureErrorReporting({ dsn: "", service: "web" })).toBe(false);
    await captureException(new Error("boom"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isErrorReportingEnabled()).toBe(false);
  });

  it("stays off (with a warning) for a malformed DSN", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(configureErrorReporting({ dsn: "nope", service: "web" })).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("captureException", () => {
  beforeEach(() => {
    configureErrorReporting({ dsn: DSN, service: "worker", environment: "production", release: "abc" });
  });

  it("posts one envelope with auth header, service tag and scrubbed message", async () => {
    await captureException(new Error("failed for jane@example.com ?token=supersecret"), { queue: "send-email" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://o1.ingest.sentry.io/api/456/envelope/");
    expect(init.headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
    const [header, item, payload] = (init.body as string).split("\n").map((l) => JSON.parse(l));
    expect(header.dsn).toBe(DSN);
    expect(item).toEqual({ type: "event" });
    expect(payload.tags).toEqual({ service: "worker" });
    expect(payload.release).toBe("abc");
    expect(payload.extra.queue).toBe("send-email");
    expect(payload.exception.values[0].value).not.toContain("jane@example.com");
    expect(payload.exception.values[0].value).not.toContain("supersecret");
  });

  it("never throws or rejects when the network fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(captureException(new Error("x"))).resolves.toBeUndefined();
  });

  it("drops events beyond 30 per minute", async () => {
    for (let i = 0; i < 40; i++) await captureException(new Error(`e${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });

  it("accepts non-Error throwables", async () => {
    await captureException("a string");
    await captureException({ weird: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("scrubErrorText / buildEvent", () => {
  it("removes emails, secret query params, bearer tokens and long opaque strings", () => {
    const out = scrubErrorText(
      "user a.b@c.io GET /verify?token=abcdef&x=1 Authorization: Bearer abcdefghijkl key " + "A".repeat(50),
    );
    expect(out).not.toMatch(/a\.b@c\.io|abcdef&|abcdefghijkl|A{50}/);
    expect(out).toContain("[email]");
    expect(out).toContain("x=1");
  });

  it("caps very long messages and stacks", () => {
    const err = new Error("word ".repeat(1000));
    err.stack = "at fn ".repeat(4000);
    const event = buildEvent(err, { dsn: DSN, service: "web" });
    expect(event.exception.values[0]!.value.length).toBe(1000);
    expect((event.extra.stack as string).length).toBe(8000);
  });
});
