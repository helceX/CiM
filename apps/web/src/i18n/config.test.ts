import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS } from "../../messages";
import { LOCALES, resolveLocale } from "./config";
import {
  AUTH_NAMESPACES,
  MARKETING_NAMESPACES,
  ONBOARDING_NAMESPACES,
  PANEL_NAMESPACES,
  SERVER_NAMESPACES,
} from "./groups";

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

  const readArea = (locale: string, area: string) =>
    JSON.parse(readFileSync(join(dir, locale, `${area}.json`), "utf8")) as Record<string, unknown>;

  it("has one folder per declared locale", () => {
    const folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(folders.map((entry) => entry.name).sort()).toEqual([...LOCALES].sort());
  });

  it.each([...LOCALES])("%s has exactly the declared areas, no more and no fewer", (locale) => {
    const files = readdirSync(join(dir, locale)).filter((file) => file.endsWith(".json"));
    expect(files.map((file) => file.replace(".json", "")).sort()).toEqual([...AREAS].sort());
  });

  describe.each([...AREAS])("area %s", (area) => {
    const reference = keyPaths(readArea("en", area)).sort();
    it.each([...LOCALES].filter((locale) => locale !== "en"))("%s has exactly the same keys as en", (locale) => {
      expect(keyPaths(readArea(locale, area)).sort()).toEqual(reference);
    });
  });

  it("never repeats a namespace across areas of one language", () => {
    const seen = new Map<string, string>();
    for (const area of AREAS) {
      for (const namespace of Object.keys(readArea("en", area))) {
        expect(seen.get(namespace), `"${namespace}" is in both ${seen.get(namespace)} and ${area}`).toBeUndefined();
        seen.set(namespace, area);
      }
    }
  });

  it("gives every namespace to at least one group, and every group only namespaces that exist", () => {
    const namespaces = AREAS.flatMap((area) => Object.keys(readArea("en", area)));
    const grouped = new Set<string>([
      ...MARKETING_NAMESPACES,
      ...AUTH_NAMESPACES,
      ...ONBOARDING_NAMESPACES,
      ...PANEL_NAMESPACES,
      ...SERVER_NAMESPACES,
    ]);
    expect([...grouped].filter((name) => !namespaces.includes(name))).toEqual([]);
    expect(namespaces.filter((name) => !grouped.has(name))).toEqual([]);
    expect([...MARKETING_NAMESPACES].sort()).toEqual(Object.keys(readArea("en", "marketing")).sort());
  });

  it("keeps the placeholders of every message identical across languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
    for (const area of AREAS) {
      const english = readArea("en", area);
      for (const locale of LOCALES.filter((code) => code !== "en")) {
        const other = readArea(locale, area);
        const walk = (a: unknown, b: unknown, path: string) => {
          if (typeof a === "string" && typeof b === "string") {
            expect(placeholders(b), `${locale}:${area}:${path}`).toEqual(placeholders(a));
          } else if (a && typeof a === "object" && b && typeof b === "object") {
            for (const key of Object.keys(a)) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
          }
        };
        walk(english, other, "");
      }
    }
  });
});
