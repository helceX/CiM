/**
 * A copy of `messages` holding only the given paths. A path is a namespace ("shell") or a branch of one
 * ("legal.forms"). A route group hands its client components just the namespaces they use, so the whole
 * catalog (which grows with every translated area) never rides along on every page.
 */
export function pickPaths(messages: Record<string, unknown>, paths: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const path of paths) {
    const keys = path.split(".");
    let source: unknown = messages;
    for (const key of keys) {
      source = source !== null && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined;
    }
    if (source === undefined) continue;
    let target = picked;
    for (const key of keys.slice(0, -1)) {
      const next = target[key];
      target = (next !== null && typeof next === "object" ? next : (target[key] = {})) as Record<string, unknown>;
    }
    target[keys[keys.length - 1]!] = source;
  }
  return picked;
}
