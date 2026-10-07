import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { ArchiveMention } from "@cim/db";
import { ObjectStore, expectedStored, storedMatches, r2ConfigFromEnv } from "./object-store";
import { renderArchiveHtml, safeHref } from "./render-archive-html";
import { renderArchiveXlsx } from "./render-archive-xlsx";

const mention = (over: Partial<ArchiveMention> = {}): ArchiveMention => ({
  mentionId: "m1",
  day: "2026-10-02",
  occurredAt: new Date("2026-10-02T09:30:00Z"),
  queryId: "q1",
  queryName: "Zorlu Holding",
  title: "Zorlu Holding yeni yatırım",
  url: "https://example.com/haber/1",
  sourceName: "Example News",
  sourceType: "news",
  sourceCountry: "TR",
  excerpt: "Kısa özet.",
  sentiment: "positive",
  priority: "normal",
  matchedTerms: ["Zorlu Holding"],
  tags: ["yatırım"],
  print: null,
  ...over,
});

describe("r2ConfigFromEnv", () => {
  it("needs all four variables", () => {
    expect(r2ConfigFromEnv({})).toBeNull();
    expect(r2ConfigFromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c" })).toBeNull();
    expect(r2ConfigFromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" })).toEqual({
      accountId: "a",
      accessKeyId: "b",
      secretAccessKey: "c",
      bucket: "d",
    });
  });
});

describe("ObjectStore", () => {
  const config = { accountId: "acct", accessKeyId: "AKID", secretAccessKey: "secret", bucket: "mediaory-archive" };

  it("signs uploads, checks and deletes against the bucket's R2 address", async () => {
    const calls: { url: string; method: string; auth: string | null; type: string | null; encoding: string | null }[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      calls.push({ url: request.url, method: request.method, auth: request.headers.get("authorization"), type: request.headers.get("content-type"), encoding: request.headers.get("accept-encoding") });
      return request.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-length": "42" } }) : new Response(null, { status: 200 });
    });
    const store = new ObjectStore(config, fetchMock as unknown as typeof fetch);
    await store.put("org/1/2026-W40/archive.html", "<p>hi</p>", "text/html; charset=utf-8", "archive 2026-W40.html");
    expect(await store.head("org/1/2026-W40/archive.html")).toEqual({ bytes: 42 });
    expect(calls[1]!.encoding).toBe("identity");
    await store.delete("org/1/2026-W40/archive.html");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "HEAD", "DELETE"]);
    expect(calls[0]!.url).toBe("https://acct.r2.cloudflarestorage.com/mediaory-archive/org/1/2026-W40/archive.html");
    expect(calls[0]!.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
    expect(calls[0]!.type).toBe("text/html; charset=utf-8");
  });

  it("reads the ETag the bucket reports, without quotes or a weak marker", async () => {
    const store = new ObjectStore(config, (async () => new Response(null, { status: 200, headers: { "content-length": "7", etag: 'W/"ABC123"' } })) as unknown as typeof fetch);
    expect(await store.head("x")).toEqual({ bytes: 7, etag: "abc123" });
  });

  it("reports a missing object as null and surfaces refusals", async () => {
    const missing = new ObjectStore(config, (async () => new Response(null, { status: 404 })) as unknown as typeof fetch);
    expect(await missing.head("x")).toBeNull();
    const refusing = new ObjectStore(config, (async () => new Response(null, { status: 403 })) as unknown as typeof fetch);
    await expect(refusing.put("x", "y", "text/plain")).rejects.toThrow(/403/);
  });

  it("makes a short-lived signed address without sending any request", async () => {
    const fetchMock = vi.fn();
    const store = new ObjectStore(config, fetchMock as unknown as typeof fetch);
    const url = new URL(await store.presignGet("org/1/a b.html", 120));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/mediaory-archive/org/1/a%20b.html");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("renderArchiveHtml", () => {
  const base = { organizationName: "Acme", periodLabel: "2026-W40", periodStart: "2026-09-28", periodEnd: "2026-10-04", generatedAt: new Date("2026-10-05T04:00:00Z"), truncated: false };

  it("renders a self-contained page grouped by day and monitoring, with a link to each original", () => {
    const html = renderArchiveHtml({ ...base, mentions: [mention(), mention({ mentionId: "m2", queryId: "q2", queryName: "THY", title: "THY haberi", url: "https://example.com/2" })] });
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("<script");
    expect(html).toContain("Friday, 2 October 2026");
    expect(html).toContain("Zorlu Holding");
    expect(html).toContain('href="https://example.com/haber/1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("#yatırım");
  });

  it("escapes everything that came from outside and never links a non-http address", () => {
    const html = renderArchiveHtml({
      ...base,
      mentions: [mention({ title: '<img src=x onerror=alert(1)>', url: "javascript:alert(1)", queryName: "<b>x</b>", excerpt: "</details><script>1</script>", tags: ['"><svg>'] })],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<svg>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("says so when the week was larger than one archive holds, and when it is empty", () => {
    expect(renderArchiveHtml({ ...base, mentions: [mention()], truncated: true })).toMatch(/more mentions than one archive holds/);
    expect(renderArchiveHtml({ ...base, mentions: [] })).toContain("No mentions this week.");
  });

  it("safeHref accepts http(s) only", () => {
    expect(safeHref("https://a.example/x?y=1")).toBe("https://a.example/x?y=1");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://x", "not a url"]) expect(safeHref(bad)).toBeNull();
  });
});

describe("renderArchiveXlsx", () => {
  it("writes one row per mention with a real link, and neutralises spreadsheet formulas", async () => {
    const buffer = await renderArchiveXlsx({
      organizationName: "Acme",
      periodLabel: "2026-W40",
      mentions: [mention({ title: '=HYPERLINK("http://evil.example","x")' }), mention({ mentionId: "m2", url: "javascript:alert(1)" })],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Mentions")!;
    expect(sheet.rowCount).toBe(3);
    expect(String(sheet.getRow(2).getCell("D").value)).toMatch(/^'=/);
    expect(sheet.getRow(2).getCell("L").value).toMatchObject({ hyperlink: "https://example.com/haber/1" });
    expect(sheet.getRow(3).getCell("L").value ?? "").toBe("");
    expect(workbook.getWorksheet("Summary")).toBeDefined();
  });
});

describe("storedMatches", () => {
  const expected = expectedStored("<p>héllo</p>");

  it("measures the uploaded bytes (not characters) and an MD5", () => {
    expect(expected.bytes).toBe(new TextEncoder().encode("<p>héllo</p>").byteLength);
    expect(expected.md5).toMatch(/^[0-9a-f]{32}$/);
    expect(expectedStored(new TextEncoder().encode("<p>héllo</p>"))).toEqual(expected);
  });

  it("accepts the same MD5 even when the reported size differs (a compressed copy)", () => {
    expect(storedMatches({ bytes: 20, etag: expected.md5 }, expected)).toBe(true);
  });

  it("accepts the same size when there is no usable tag, and refuses when neither agrees", () => {
    expect(storedMatches({ bytes: expected.bytes }, expected)).toBe(true);
    expect(storedMatches({ bytes: expected.bytes, etag: "deadbeef-2" }, expected)).toBe(true);
    expect(storedMatches({ bytes: 3, etag: "deadbeef" }, expected)).toBe(false);
  });
});
