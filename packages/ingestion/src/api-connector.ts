import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";

/**
 * docs/architecture/INGESTION.md `APIConnector` ("official third-party
 * APIs") — the documented JSON contract any API-backed Source must
 * return, the same role RSS 2.0/Atom play for `RSSConnector`. A `title`
 * or `content` missing on a given item is tolerated (falls back the same
 * way `RSSConnector` falls back to "(untitled)"); a missing `url` drops
 * that one item rather than failing the whole fetch, since there is no
 * canonical URL to key it on.
 *
 * ```json
 * {
 *   "items": [
 *     {
 *       "id": "string — stable external id, falls back to url",
 *       "title": "string",
 *       "url": "string — canonical URL, required",
 *       "publishedAt": "ISO 8601 string or null",
 *       "content": "string — body text",
 *       "author": "string or null",
 *       "language": "string or null"
 *     }
 *   ]
 * }
 * ```
 */
type ApiItem = {
  id?: string;
  title?: string;
  url?: string;
  publishedAt?: string | null;
  content?: string;
  author?: string | null;
  language?: string | null;
};

type ApiResponseBody = { items?: ApiItem[] };

/**
 * `source.apiKey` is optional (an API-connector Source with no key
 * configured is simply an unauthenticated endpoint). When set, the
 * header name defaults to "Authorization" with a "Bearer " prefix — the
 * most common convention — otherwise the key is sent as-is under
 * whatever header name was configured (e.g. "X-Api-Key").
 */
function authHeaders(source: Source): Record<string, string> {
  if (!source.apiKey) return {};
  const headerName = source.apiKeyHeaderName || "Authorization";
  const value =
    headerName.toLowerCase() === "authorization"
      ? `Bearer ${source.apiKey}`
      : source.apiKey;
  return { [headerName]: value };
}

function parseItems(body: string): ApiItem[] {
  const parsed = JSON.parse(body) as ApiResponseBody;
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export class APIConnector implements SourceConnector {
  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url)
      throw new Error(`Source "${source.name}" has no API endpoint configured`);

    const { status, body } = await safeFetch(source.url, {
      headers: authHeaders(source),
    });
    if (status >= 400) {
      throw new Error(`API endpoint for "${source.name}" responded HTTP ${status}`);
    }

    const items = parseItems(body);
    return items
      .filter((item): item is ApiItem & { url: string } => Boolean(item.url))
      .map((item) => ({
        externalId: item.id || item.url,
        canonicalUrl: item.url,
        title: item.title || "(untitled)",
        bodyText: item.content ?? "",
        language: item.language ?? source.language,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        authorName: item.author ?? null,
      }));
  }

  async healthCheck(source: Source): Promise<SourceHealth> {
    if (!source.url)
      return { status: "unavailable", message: "No API endpoint configured" };
    try {
      const { status, body } = await safeFetch(source.url, {
        headers: authHeaders(source),
        timeoutMs: 8000,
      });
      if (status === 401 || status === 403) {
        return {
          status: "blocked",
          message: `API endpoint responded HTTP ${status} — check the configured key`,
        };
      }
      if (status >= 400)
        return { status: "error", message: `API endpoint responded HTTP ${status}` };
      parseItems(body);
      return { status: "healthy" };
    } catch (error) {
      if (error instanceof SsrfBlockedError)
        return { status: "blocked", message: error.message };
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
