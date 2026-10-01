import { describe, expect, it } from "vitest";
import type { Source } from "@cim/db/schema";
import { SNIPPET_MAX_CHARS, computeContentHash, makeSnippet, normalizeToArticleInput } from "./normalize";
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

describe("makeSnippet", () => {
  it("keeps short text as is (whitespace collapsed)", () => {
    expect(makeSnippet("  Short   lead.\n")).toBe("Short lead.");
  });

  it("never exceeds the cap and ends at a sentence when one fits", () => {
    const text = `${"Birinci cümle burada biter. ".repeat(10)}${"x".repeat(400)}`;
    const snippet = makeSnippet(text);
    expect(snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(snippet.endsWith(".")).toBe(true);
  });

  it("cuts at a word boundary with an ellipsis otherwise", () => {
    const text = "kelime ".repeat(100);
    const snippet = makeSnippet(text);
    expect(snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS + 1);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).not.toMatch(/\skelim…$/);
  });

  it("handles one long unbroken string", () => {
    expect(makeSnippet("a".repeat(500)).length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS + 1);
  });
});
