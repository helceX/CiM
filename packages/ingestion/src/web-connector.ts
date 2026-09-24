import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { extractTitle, htmlToPlainText } from "./html-text";
import { isAllowedByRobotsTxt } from "./robots";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";

/**
 * docs/architecture/INGESTION.md `WebConnector` — "direct fetch + HTML
 * parse" of a single configured page (e.g. a newsroom/press page), polled
 * repeatedly. Re-fetching unchanged content is intentional and cheap:
 * the pipeline's canonical-URL/content-hash dedupe (packages/ingestion's
 * `ingestSource`) already no-ops on an unchanged page, so a "new" article
 * only appears here when the page's content actually changed.
 */
export class WebConnector implements SourceConnector {
  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url) throw new Error(`Source "${source.name}" has no page URL configured`);

    const allowed = await isAllowedByRobotsTxt(source.url);
    if (!allowed) return [];

    const { body } = await safeFetch(source.url);
    return [
      {
        externalId: source.url,
        canonicalUrl: source.url,
        title: extractTitle(body) ?? source.name,
        bodyText: htmlToPlainText(body),
        language: source.language,
        publishedAt: null,
        authorName: null,
      },
    ];
  }

  async healthCheck(source: Source): Promise<SourceHealth> {
    if (!source.url) return { status: "unavailable", message: "No page URL configured" };
    try {
      const { status } = await safeFetch(source.url, { timeoutMs: 8000 });
      if (status >= 400) return { status: "error", message: `Page responded HTTP ${status}` };
      return { status: "healthy" };
    } catch (error) {
      if (error instanceof SsrfBlockedError) return { status: "blocked", message: error.message };
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
