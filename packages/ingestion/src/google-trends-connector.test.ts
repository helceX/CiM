import { describe, expect, it, vi } from "vitest";
import { GoogleTrendsConnector } from "./google-trends-connector";
import type { Source } from "@cim/db/schema";

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Trends</title>
<item><title>örnek trend</title><link>https://trends.google.com/trending/stories/1</link><description>5000+ searches</description></item>
</channel></rss>`;
const source = {
  id: "s1",
  name: "Google Trends TR",
  url: "https://trends.google.com/trending/rss?geo=TR",
  connector: "google-trends",
  type: "trends",
  language: "tr",
} as Source;

describe("GoogleTrendsConnector", () => {
  it("never fetches while disabled and uses a daily synthetic identity when enabled", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 200, body: rss });
    const disabled = new GoogleTrendsConnector({ fetcher, robotsBlocked: async () => false });
    expect((await disabled.healthCheck(source)).status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();

    const connector = new GoogleTrendsConnector({
      fetcher,
      robotsBlocked: async () => false,
      environment: {
        CIM_EXTERNAL_COVERAGE_ENABLED: "true",
        CIM_GOOGLE_TRENDS_RSS_ENABLED: "true",
      },
      now: () => new Date("2026-10-09T12:00:00.000Z"),
    });
    const [item] = await connector.fetch(source);
    expect(item).toMatchObject({
      externalId: expect.stringMatching(/^google-trends:TR:2026-10-09:/),
      canonicalUrl: expect.stringContaining("date=2026-10-09"),
      title: "örnek trend",
      bodyText: "Google Trends listing for TR on 2026-10-09.",
      authorName: null,
    });
    expect(item?.canonicalUrl).not.toContain("5000");
    expect(item?.bodyText).not.toContain("5000");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps repeated polls idempotent but distinguishes the same trend on a new day", async () => {
    let day = "2026-10-09";
    const connector = new GoogleTrendsConnector({
      fetcher: async () => ({ status: 200, body: rss }),
      robotsBlocked: async () => false,
      environment: { CIM_EXTERNAL_COVERAGE_ENABLED: "true", CIM_GOOGLE_TRENDS_RSS_ENABLED: "true" },
      now: () => new Date(`${day}T12:00:00.000Z`),
    });
    const [first] = await connector.fetch(source);
    const [repeat] = await connector.fetch(source);
    expect(repeat).toEqual(first);
    day = "2026-10-10";
    const [next] = await connector.fetch(source);
    expect(next?.externalId).not.toEqual(first?.externalId);
    expect(next?.canonicalUrl).not.toEqual(first?.canonicalUrl);
    // The pipeline's content hash includes title + body, so both must not stay
    // identical across days or its dedupe would erase the next day's signal.
    expect(next?.bodyText).not.toEqual(first?.bodyText);
  });

  it("rejects an unapproved geography before network access", async () => {
    const fetcher = vi.fn();
    const connector = new GoogleTrendsConnector({
      fetcher,
      environment: {
        CIM_EXTERNAL_COVERAGE_ENABLED: "true",
        CIM_GOOGLE_TRENDS_RSS_ENABLED: "true",
      },
    });
    expect((await connector.healthCheck({ ...source, url: "https://trends.google.com/trending/rss?geo=US" })).status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
