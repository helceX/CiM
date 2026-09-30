import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, resolveLocale } from "./config";

describe("resolveLocale", () => {
  const supported = ["en", "tr", "de"];

  it("prefers an explicit cookie over the browser language", () => {
    expect(resolveLocale({ cookie: "de", acceptLanguage: "tr" }, supported)).toBe("de");
  });

  it("ignores a cookie for a locale that is not supported", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "tr" }, supported)).toBe("tr");
  });

  it("orders Accept-Language by q-value and matches the primary subtag", () => {
    expect(
      resolveLocale({ acceptLanguage: "fr;q=0.9, tr-TR;q=0.8, en;q=0.5" }, supported),
    ).toBe("tr");
  });

  it("skips languages with q=0 and falls back to the default", () => {
    expect(resolveLocale({ acceptLanguage: "tr;q=0, fr" }, supported)).toBe("en");
    expect(resolveLocale({}, supported)).toBe("en");
  });

  it("negotiates among the declared locales and defaults to English", () => {
    expect(resolveLocale({ acceptLanguage: "tr-TR,tr;q=0.9" })).toBe("tr");
    expect(resolveLocale({ acceptLanguage: "fr-FR" })).toBe("en");
    expect(resolveLocale({ cookie: "tr", acceptLanguage: "en" })).toBe("tr");
  });
});

describe("message catalogs", () => {
  const dir = join(__dirname, "../../messages");

  function keyPaths(value: unknown, prefix = ""): string[] {
    if (value === null || typeof value !== "object") return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      keyPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  const catalogs = readdirSync(dir).filter((file) => file.endsWith(".json"));
  const reference = keyPaths(JSON.parse(readFileSync(join(dir, "en.json"), "utf8"))).sort();

  it("has one catalog per declared locale", () => {
    expect(catalogs.map((file) => file.replace(".json", "")).sort()).toEqual([...LOCALES].sort());
  });

  it.each(catalogs)("%s has exactly the same keys as en.json", (file) => {
    const keys = keyPaths(JSON.parse(readFileSync(join(dir, file), "utf8"))).sort();
    expect(keys).toEqual(reference);
  });
});
