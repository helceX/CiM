import { describe, expect, it } from "vitest";
import { inferCountryFromHost, inferCountryFromSource } from "./country-from-host";

describe("inferCountryFromHost", () => {
  it("reads a country's own ending", () => {
    expect(inferCountryFromHost("bebka.org.tr")).toBe("TR");
    expect(inferCountryFromHost("www.spiegel.de")).toBe("DE");
    expect(inferCountryFromHost("feeds.bbc.co.uk")).toBe("GB");
    expect(inferCountryFromHost("example.com.br")).toBe("BR");
    expect(inferCountryFromHost("EXAMPLE.JP.")).toBe("JP");
  });

  it("does not guess from general-purpose endings or unknown ones", () => {
    for (const host of ["webrazzi.com", "techcrunch.com", "startup.io", "channel.tv", "site.me", "x.co", "foo.eu", "bar.xx", "localhost", "", null, undefined]) {
      expect(inferCountryFromHost(host)).toBeNull();
    }
  });
});

describe("inferCountryFromSource", () => {
  it("uses Turkish language and source/feed text before falling back to the host", () => {
    expect(inferCountryFromSource({ language: "tr-TR", domain: "example.com" })).toBe("TR");
    expect(inferCountryFromSource({ name: "Ekonomi Haber", domain: "example.com" })).toBe("TR");
    expect(inferCountryFromSource({ url: "https://example.com/rss?q=T%C3%BCrkiye+g%C3%BCndem" })).toBe("TR");
    expect(inferCountryFromSource({ domain: "example.de", language: "en" })).toBe("DE");
    expect(inferCountryFromSource({ name: "Tech News", domain: "example.com", language: "en" })).toBeNull();
  });
});
