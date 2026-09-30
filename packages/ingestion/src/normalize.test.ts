import { describe, expect, it } from "vitest";
import type { Source } from "@cim/db/schema";
import { computeContentHash, normalizeToArticleInput } from "./normalize";
import type { RawFetchResult } from "./connector";

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "s1",
    name: "Test Wire",
    domain: "testwire.example",
    country: null,
    language: "en",
    type: "news",
    connector: "mock",
    url: null,
    apiKeyHeaderName: null,
    apiKey: null,
    status: "healthy",
    lastCheckedAt: null,
    canStoreFullText: false,
    canDisplayFullText: false,
    canDisplayExcerpt: true,
    canStoreMedia: false,
    canProcessAi: true,
    license: null,
    termsUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const raw: RawFetchResult = {
  externalId: "e1",
  canonicalUrl: "https://testwire.example/a",
  title: "Example headline",
  bodyText: "Example body text that is reasonably long for an excerpt test.",
  language: "en",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  authorName: "Jane Doe",
};

describe("computeContentHash", () => {
  it("is deterministic for the same title/body", () => {
    expect(computeContentHash("A", "B")).toEqual(computeContentHash("A", "B"));
  });

  it("differs when the body changes", () => {
    expect(computeContentHash("A", "B")).not.toEqual(computeContentHash("A", "C"));
  });
});

describe("normalizeToArticleInput", () => {
  it("stores an excerpt when the source policy allows displaying one", () => {
    const article = normalizeToArticleInput(
      fakeSource({ canDisplayExcerpt: true }),
      raw,
    );
    expect(article.storedExcerpt).not.toBeNull();
  });

  it("stores nothing when the source policy forbids displaying an excerpt", () => {
    const article = normalizeToArticleInput(
      fakeSource({ canDisplayExcerpt: false }),
      raw,
    );
    expect(article.storedExcerpt).toBeNull();
  });
});
