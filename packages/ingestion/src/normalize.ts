import { createHash } from "node:crypto";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult } from "./connector";

export function computeContentHash(title: string, bodyText: string): string {
  return createHash("sha256").update(`${title}\n${bodyText}`).digest("hex");
}

/** The most we ever keep of a publisher's text: a short lead, never the article. */
export const SNIPPET_MAX_CHARS = 200;

/**
 * Whitespace-collapsed lead of `text`, at most SNIPPET_MAX_CHARS, ended at the
 * last full sentence or word that fits and marked with "…" when cut. We keep a
 * snippet and a link to the original, so the reader goes to the publisher.
 */
export function makeSnippet(text: string, max: number = SNIPPET_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= max * 0.5) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(" ");
  return `${(wordEnd > 0 ? head.slice(0, wordEnd) : head).replace(/[\s,;:–-]+$/, "")}…`;
}

/**
 * docs/architecture/SECURITY.md — SourcePolicy is enforced here, at
 * ingestion time: fields the policy forbids storing are never written,
 * regardless of what the connector returned.
 */
export function normalizeToArticleInput(source: Source, raw: RawFetchResult) {
  const excerpt = makeSnippet(raw.bodyText);
  return {
    sourceId: source.id,
    canonicalUrl: raw.canonicalUrl,
    contentHash: computeContentHash(raw.title, raw.bodyText),
    title: raw.title,
    storedExcerpt: source.canDisplayExcerpt ? excerpt : null,
    language: raw.language ?? null,
    publishedAt: raw.publishedAt,
    authorName: raw.authorName ?? null,
    print: raw.print ?? null,
  };
}
