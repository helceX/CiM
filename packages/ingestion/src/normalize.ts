import { createHash } from "node:crypto";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult } from "./connector";

export function computeContentHash(title: string, bodyText: string): string {
  return createHash("sha256").update(`${title}\n${bodyText}`).digest("hex");
}

/**
 * docs/architecture/SECURITY.md — SourcePolicy is enforced here, at
 * ingestion time: fields the policy forbids storing are never written,
 * regardless of what the connector returned.
 */
export function normalizeToArticleInput(source: Source, raw: RawFetchResult) {
  const excerpt = raw.bodyText.slice(0, 280);
  return {
    sourceId: source.id,
    canonicalUrl: raw.canonicalUrl,
    contentHash: computeContentHash(raw.title, raw.bodyText),
    title: raw.title,
    storedExcerpt: source.canDisplayExcerpt ? excerpt : null,
    language: raw.language ?? null,
    publishedAt: raw.publishedAt,
    authorName: raw.authorName ?? null,
  };
}
