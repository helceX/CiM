import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AUTH_NAMESPACES, MARKETING_NAMESPACES, ONBOARDING_NAMESPACES, PANEL_NAMESPACES } from "./groups";

/**
 * A client component can only read the namespaces its route group hands to the browser (groups.ts). Asking for
 * another one fails at run time with MISSING_MESSAGE — which no type check sees — so this reads the sources and
 * checks every client component against the list of the part of the site it is rendered in.
 */
const src = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

/** The top-level namespaces a client component asks for: useTranslations("shell.nav") → "shell". */
export function clientNamespaces(source: string): string[] {
  if (!/^\s*["']use client["']/.test(source)) return [];
  return [...source.matchAll(/useTranslations\(\s*["']([A-Za-z]+)/g)].map((match) => match[1]!);
}

function groupFor(path: string): { name: string; allowed: readonly string[] } | null {
  const rel = relative(src, path).split(sep).join("/");
  if (rel.startsWith("app/(public)/")) return { name: "AUTH_NAMESPACES", allowed: AUTH_NAMESPACES };
  if (rel.startsWith("app/onboarding/")) return { name: "ONBOARDING_NAMESPACES", allowed: ONBOARDING_NAMESPACES };
  if (rel.startsWith("app/(app)/")) return { name: "PANEL_NAMESPACES", allowed: PANEL_NAMESPACES };
  if (rel.startsWith("app/(marketing)/") || rel.startsWith("components/marketing/")) {
    return { name: "MARKETING_NAMESPACES", allowed: MARKETING_NAMESPACES };
  }
  if (rel === "components/auth-card.tsx") return { name: "AUTH_NAMESPACES", allowed: AUTH_NAMESPACES };
  // The rest of components/ is the panel's own (shell, charts, filters).
  if (rel.startsWith("components/")) return { name: "PANEL_NAMESPACES", allowed: PANEL_NAMESPACES };
  return null;
}

describe("route groups hand their client components every namespace they use", () => {
  it("finds the namespaces of a client component and ignores a server one", () => {
    expect(clientNamespaces('"use client";\nconst t = useTranslations("shell.nav");\nuseTranslations(\'ui\')')).toEqual(["shell", "ui"]);
    expect(clientNamespaces('const t = useTranslations("shell");')).toEqual([]);
  });

  for (const file of tsxFiles(src)) {
    const group = groupFor(file);
    const used = group ? clientNamespaces(readFileSync(file, "utf8")) : [];
    if (!group || used.length === 0) continue;
    it(`${relative(src, file).split(sep).join("/")} → ${group.name}`, () => {
      const missing = [...new Set(used)].filter((namespace) => !group.allowed.includes(namespace));
      expect(missing, `add ${missing.join(", ")} to ${group.name} in src/i18n/groups.ts`).toEqual([]);
    });
  }
});
