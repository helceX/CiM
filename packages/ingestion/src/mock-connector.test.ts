import { describe, expect, it } from "vitest";
import type { Source } from "@cim/db/schema";
import { MockNewsConnector } from "./mock-connector";

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Wire",
    domain: "testwire.example",
    country: null,
    language: "en",
    type: "news",
    connector: "mock",
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

describe("MockNewsConnector", () => {
  it("is idempotent within the same time bucket", async () => {
    const connector = new MockNewsConnector();
    const source = fakeSource();
    const [first] = await connector.fetch(source);
    const [second] = await connector.fetch(source);
    expect(first).toEqual(second);
  });

  it("produces different content for different sources", async () => {
    const connector = new MockNewsConnector();
    const [a] = await connector.fetch(fakeSource({ id: "a", name: "Wire A", domain: "a.example" }));
    const [b] = await connector.fetch(fakeSource({ id: "b", name: "Wire B", domain: "b.example" }));
    expect(a?.canonicalUrl).not.toEqual(b?.canonicalUrl);
    expect(a?.title).not.toEqual(b?.title);
  });

  it("labels its content as synthetic, never presenting it as real coverage", async () => {
    const connector = new MockNewsConnector();
    const [item] = await connector.fetch(fakeSource());
    expect(item?.bodyText).toMatch(/synthetic|mock/i);
  });

  it("reports healthy without any network access", async () => {
    const connector = new MockNewsConnector();
    const health = await connector.healthCheck(fakeSource());
    expect(health.status).toBe("healthy");
  });
});
