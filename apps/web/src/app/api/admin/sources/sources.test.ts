import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSuperAdmin = vi.fn();
const checkRateLimit = vi.fn();
const testSourceUrl = vi.fn();
const createSource = vi.fn();
const setSourceCrawlEnabled = vi.fn();
const bulkSetSourcesCrawlEnabled = vi.fn();
const checkSourcePolicy = vi.fn();

vi.mock("@/lib/admin", () => ({ requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
vi.mock("@/lib/source-test", () => ({ testSourceUrl: (...a: unknown[]) => testSourceUrl(...a) }));
vi.mock("@cim/db", () => ({
  db: {},
  createSource: (...a: unknown[]) => createSource(...a),
  checkSourcePolicy: (...a: unknown[]) => checkSourcePolicy(...a),
  setSourceCrawlEnabled: (...a: unknown[]) => setSourceCrawlEnabled(...a),
  bulkSetSourcesCrawlEnabled: (...a: unknown[]) => bulkSetSourcesCrawlEnabled(...a),
}));

const sources = await import("./route");
const test = await import("./test/route");
const crawl = await import("./[id]/crawl/route");
const bulk = await import("./bulk/route");

const json = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const uuid = "22222222-2222-4222-8222-222222222222";
const valid = { name: "Example", url: "https://example.com/rss.xml" };

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "admin-1", email: "a@b.c" });
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
  checkSourcePolicy.mockResolvedValue(null);
});

describe("admin source API", () => {
  it("answers 404 to non-admins and does nothing", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NOT_SUPER_ADMIN"));
    expect((await sources.POST(json(valid))).status).toBe(404);
    expect((await test.POST(json(valid))).status).toBe(404);
    expect((await crawl.POST(json({ enabled: false }), params(uuid))).status).toBe(404);
    expect(testSourceUrl).not.toHaveBeenCalled();
    expect(createSource).not.toHaveBeenCalled();
    expect(setSourceCrawlEnabled).not.toHaveBeenCalled();
  });

  it("rejects non-https addresses and bad input before fetching anything", async () => {
    expect((await sources.POST(json({ ...valid, url: "http://example.com/rss" }))).status).toBe(400);
    expect((await sources.POST(json({ ...valid, url: "javascript:alert(1)" }))).status).toBe(400);
    expect((await sources.POST(json({ ...valid, name: "" }))).status).toBe(400);
    expect((await sources.POST(json({ ...valid, connector: "web" }))).status).toBe(400);
    expect((await test.POST(json({ url: "ftp://x.y/z" }))).status).toBe(400);
    expect(testSourceUrl).not.toHaveBeenCalled();
  });

  it("does not store a feed that could not be read", async () => {
    testSourceUrl.mockResolvedValue({ ok: false, message: "The feed has no items." });
    const res = await sources.POST(json(valid));
    expect(res.status).toBe(422);
    expect(createSource).not.toHaveBeenCalled();
  });

  it("stores a readable feed and reports a duplicate as 409", async () => {
    testSourceUrl.mockResolvedValue({ ok: true, itemCount: 12, sampleTitles: [] });
    createSource.mockResolvedValueOnce({ ok: true, id: uuid });
    const created = await sources.POST(json(valid));
    expect(created.status).toBe(201);
    expect(createSource.mock.calls[0]![1]).toMatchObject({
      url: valid.url,
      connector: "rss",
      type: "news",
      language: "tr",
    });

    createSource.mockResolvedValueOnce({ ok: false, reason: "duplicate" });
    expect((await sources.POST(json(valid))).status).toBe(409);
  });

  it("ignores policy fields a client tries to send", async () => {
    testSourceUrl.mockResolvedValue({ ok: true, itemCount: 1, sampleTitles: [] });
    createSource.mockResolvedValue({ ok: true, id: uuid });
    await sources.POST(json({ ...valid, canStoreFullText: true, apiKey: "secret-long-key" }));
    const stored = createSource.mock.calls[0]![1] as Record<string, unknown>;
    expect(stored).not.toHaveProperty("canStoreFullText");
    expect(stored).not.toHaveProperty("apiKey"); // a feed never keeps a key
  });

  it("keeps an API provider's key and header, tests it with them, and never echoes the key", async () => {
    testSourceUrl.mockResolvedValue({ ok: true, itemCount: 4, sampleTitles: [] });
    createSource.mockResolvedValue({ ok: true, id: uuid });
    const response = await sources.POST(
      json({ ...valid, connector: "api", type: "newspaper", apiKey: "provider-key-123", apiKeyHeaderName: "X-Api-Key" }),
    );
    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).not.toContain("provider-key-123");
    expect(testSourceUrl).toHaveBeenCalledWith(valid.url, "api", { apiKey: "provider-key-123", apiKeyHeaderName: "X-Api-Key" });
    expect(createSource.mock.calls[0]![1]).toMatchObject({
      connector: "api",
      type: "newspaper",
      apiKey: "provider-key-123",
      apiKeyHeaderName: "X-Api-Key",
    });
  });

  it("stores a social feed as a global youtube/social source", async () => {
    testSourceUrl.mockResolvedValue({ ok: true, itemCount: 3, sampleTitles: [] });
    createSource.mockResolvedValue({ ok: true, id: uuid });
    const response = await sources.POST(json({ ...valid, type: "youtube", country: "ZZ", language: "other" }));
    expect(response.status).toBe(201);
    expect(createSource.mock.calls[0]![1]).toMatchObject({ type: "youtube", country: "ZZ", language: "other" });
  });

  it("never fetches a blocked publisher or an unlicensed agency", async () => {
    checkSourcePolicy.mockResolvedValueOnce("blocked");
    const blocked = await sources.POST(json(valid));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: "blocked" });

    checkSourcePolicy.mockResolvedValueOnce("license_required");
    const agency = await sources.POST(json({ ...valid, url: "https://www.aa.com.tr/rss.xml" }));
    expect(agency.status).toBe(422);
    expect(await agency.json()).toMatchObject({ code: "license_required" });

    expect(testSourceUrl).not.toHaveBeenCalled();
    expect(createSource).not.toHaveBeenCalled();
  });

  it("passes the admin's licence confirmation through to the policy check", async () => {
    testSourceUrl.mockResolvedValue({ ok: true, itemCount: 1, sampleTitles: [] });
    createSource.mockResolvedValue({ ok: true, id: uuid });
    await sources.POST(json({ ...valid, licenseConfirmed: true }));
    expect(checkSourcePolicy.mock.calls[0]![2]).toBe(true);
    expect(createSource.mock.calls[0]![1]).toMatchObject({ licenseConfirmed: true });
  });

  it("is rate limited", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await sources.POST(json(valid))).status).toBe(429);
    expect((await test.POST(json(valid))).status).toBe(429);
  });

  it("pauses/resumes by uuid only", async () => {
    expect((await crawl.POST(json({ enabled: false }), params("nope"))).status).toBe(404);
    expect((await crawl.POST(json({ enabled: "x" }), params(uuid))).status).toBe(400);
    setSourceCrawlEnabled.mockResolvedValueOnce(true);
    expect((await crawl.POST(json({ enabled: false }), params(uuid))).status).toBe(200);
    expect(setSourceCrawlEnabled.mock.calls[0]).toEqual([{}, uuid, false]);
    setSourceCrawlEnabled.mockResolvedValueOnce(false);
    expect((await crawl.POST(json({ enabled: true }), params(uuid))).status).toBe(404);
  });
});

describe("bulk pause / resume API", () => {
  beforeEach(() => bulkSetSourcesCrawlEnabled.mockResolvedValue({ changed: 7, skippedBlocked: 0 }));

  it("answers 404 to non-admins and changes nothing", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("NOT_SUPER_ADMIN"));
    expect((await bulk.POST(json({ enabled: false }))).status).toBe(404);
    expect(bulkSetSourcesCrawlEnabled).not.toHaveBeenCalled();
  });

  it("pauses everything when no region or kind is given", async () => {
    const response = await bulk.POST(json({ enabled: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, changed: 7 });
    expect(bulkSetSourcesCrawlEnabled).toHaveBeenCalledWith({}, { countries: undefined, types: undefined }, false);
  });

  it("turns a continent into its country codes and kinds into source types", async () => {
    await bulk.POST(json({ enabled: false, region: "eur", kinds: ["forums"] }));
    const [, filter] = bulkSetSourcesCrawlEnabled.mock.calls[0]!;
    expect(filter.countries).toContain("DE");
    expect(filter.countries).toContain("TR");
    expect(filter.countries).not.toContain("US");
    expect(filter.types).toEqual(["forum", "comments"]);
  });

  it("scopes to one country, and to an explicit selection when ids are sent", async () => {
    await bulk.POST(json({ enabled: true, region: "tr" }));
    expect(bulkSetSourcesCrawlEnabled.mock.calls[0]![1].countries).toEqual(["TR"]);
    await bulk.POST(json({ enabled: false, ids: [uuid] }));
    expect(bulkSetSourcesCrawlEnabled.mock.calls[1]![1]).toEqual({ ids: [uuid] });
  });

  it("rejects bad input and is rate limited", async () => {
    expect((await bulk.POST(json({ enabled: "yes" }))).status).toBe(400);
    expect((await bulk.POST(json({ enabled: false, region: "../etc" }))).status).toBe(400);
    expect((await bulk.POST(json({ enabled: false, kinds: ["nope"] }))).status).toBe(400);
    expect((await bulk.POST(json({ enabled: false, ids: ["not-a-uuid"] }))).status).toBe(400);
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await bulk.POST(json({ enabled: false }))).status).toBe(429);
  });
});
