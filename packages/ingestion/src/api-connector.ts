import type { Source } from "@cim/db/schema";
import { parseArticlePrint } from "@cim/core";
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
 *       "language": "string or null",
 *       "print": {            // optional — only for stories from a PRINTED edition
 *         "publication": "string — newspaper/magazine name, required if print is given",
 *         "editionDate": "YYYY-MM-DD or null",
 *         "page": "integer or null",
 *         "section": "string or null",
 *         "pageUrl": "https URL where the page can be viewed, or null",
 *         "pageImageUrl": "https URL of a page/clipping preview image, or null"
 *       }
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
  print?: unknown;
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
        print: parseArticlePrint(item.print),
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

export type ApiEndpointTest =
  | { ok: true; itemCount: number; printCount: number; sampleTitles: string[] }
  | { ok: false; message: string };

/**
 * Fetches a candidate JSON endpoint exactly as the crawler would (same SSRF
 * guard, same auth header convention) and reports what it found — used by the
 * admin screen before a clipping/API provider is saved.
 */
export async function testApiEndpoint(
  url: string,
  auth: { apiKey?: string | null; apiKeyHeaderName?: string | null } = {},
): Promise<ApiEndpointTest> {
  try {
    const headers = authHeaders({ apiKey: auth.apiKey ?? null, apiKeyHeaderName: auth.apiKeyHeaderName ?? null } as Source);
    const { status, body } = await safeFetch(url, { headers, timeoutMs: 8000 });
    if (status === 401 || status === 403) return { ok: false, message: `The endpoint answered HTTP ${status} — check the key.` };
    if (status >= 400) return { ok: false, message: `The endpoint answered HTTP ${status}.` };
    let items: ApiItem[];
    try {
      items = parseItems(body);
    } catch {
      return { ok: false, message: "The endpoint did not return JSON." };
    }
    const usable = items.filter((item) => Boolean(item.url));
    if (usable.length === 0) return { ok: false, message: 'The response has no items with a "url".' };
    return {
      ok: true,
      itemCount: usable.length,
      printCount: usable.filter((item) => parseArticlePrint(item.print)).length,
      sampleTitles: usable.slice(0, 3).map((item) => item.title ?? item.url!),
    };
  } catch (error) {
    if (error instanceof SsrfBlockedError) return { ok: false, message: "That address is not allowed." };
    return { ok: false, message: error instanceof Error ? `Could not read it: ${error.message}` : "Could not read it." };
  }
}
