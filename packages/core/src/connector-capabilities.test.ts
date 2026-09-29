import { describe, expect, it } from "vitest";
import {
  CONNECTOR_CAPABILITIES,
  getConnectorCapabilities,
} from "./connector-capabilities";

describe("getConnectorCapabilities", () => {
  it("reports mock-social as supporting author metrics but not engagement", () => {
    const caps = getConnectorCapabilities("mock-social");
    expect(caps.authorMetrics).toBe("supported");
    expect(caps.engagementMetrics).toBe("unavailable");
  });

  it("reports every capability as provider_required for a not-yet-implemented platform connector", () => {
    const caps = getConnectorCapabilities("social");
    expect(Object.values(caps).every((status) => status === "provider_required")).toBe(
      true,
    );
  });

  it("falls back to every capability unavailable for an unrecognized connector name, never a guess", () => {
    const caps = getConnectorCapabilities("some-future-connector-nobody-registered");
    expect(Object.values(caps).every((status) => status === "unavailable")).toBe(true);
  });

  it("has a table entry for every connector currently registered in the worker (mock, mock-social, rss, sitemap, web, api)", () => {
    for (const connector of ["mock", "mock-social", "rss", "sitemap", "web", "api"]) {
      expect(CONNECTOR_CAPABILITIES[connector]).toBeDefined();
    }
  });
});
