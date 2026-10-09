import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Stands in for `next-intl/server` in unit tests (wired up as an alias in vitest.config.ts).
 *
 * Server code that speaks to people (API error messages, server-rendered text) asks next-intl for its wording.
 * next-intl's server API needs a running Next.js request, so tests get this: it answers from the English
 * catalog, with the simple `{name}` placeholders filled in. Everything else about i18n (catalog parity, the
 * language negotiation) is tested directly in apps/web/src/i18n.
 *
 * An alias rather than `vi.mock` in a setup file: a mock is keyed by the module the specifier resolves to, and
 * `next-intl` is installed under apps/web only, so a mock registered from the repository root never matched.
 */
const catalogDir = join(fileURLToPath(new URL(".", import.meta.url)), "apps/web/messages/en");

function loadEnglish(): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const file of readdirSync(catalogDir).filter((name) => name.endsWith(".json"))) {
    Object.assign(merged, JSON.parse(readFileSync(join(catalogDir, file), "utf8")));
  }
  return merged;
}

const english = loadEnglish();

function node(path: string): unknown {
  let current: unknown = english;
  for (const part of path.split(".")) {
    current = current !== null && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined;
  }
  return current;
}

function translator(namespace?: string) {
  const full = (key: string) => (namespace ? `${namespace}.${key}` : key);
  const t = (key: string, values: Record<string, string | number> = {}) => {
    const found = node(full(key));
    const text = typeof found === "string" ? found : full(key);
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
  };
  t.raw = (key: string) => node(full(key));
  return t;
}

export async function getTranslations(arg?: string | { namespace?: string }) {
  return translator(typeof arg === "string" ? arg : arg?.namespace);
}

export async function getLocale() {
  return "en";
}

export async function getMessages() {
  return english;
}
