import { describe, expect, it } from "vitest";
import { TURKEY_SOURCE_CATALOG } from "./source-catalog";
import {
  hostMatchesDomain,
  hostOfUrl,
  isLicenseRequiredHost,
  normalizeHost,
} from "./restricted-publishers";

describe("restricted publishers", () => {
  it("flags agencies and their subdomains, not lookalikes", () => {
    expect(isLicenseRequiredHost("aa.com.tr")).toBe(true);
    expect(isLicenseRequiredHost("www.aa.com.tr")).toBe(true);
    expect(isLicenseRequiredHost("feeds.reuters.com")).toBe(true);
    expect(isLicenseRequiredHost("WWW.DHA.COM.TR.")).toBe(true);
    expect(isLicenseRequiredHost("notaa.com.tr")).toBe(false);
    expect(isLicenseRequiredHost("aa.com.tr.evil.example")).toBe(false);
    expect(isLicenseRequiredHost("webrazzi.com")).toBe(false);
  });

  it("never ships an agency in the catalog", () => {
    for (const entry of TURKEY_SOURCE_CATALOG) {
      expect(isLicenseRequiredHost(hostOfUrl(entry.url) ?? "")).toBe(false);
    }
  });

  it("normalises hosts and matches subdomains", () => {
    expect(normalizeHost(" WWW.Example.COM. ")).toBe("example.com");
    expect(hostOfUrl("https://www.Example.com/rss")).toBe("example.com");
    expect(hostOfUrl("not a url")).toBeNull();
    expect(hostMatchesDomain("a.b.example.com", "example.com")).toBe(true);
    expect(hostMatchesDomain("badexample.com", "example.com")).toBe(false);
  });
});
