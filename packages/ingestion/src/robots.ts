import { safeFetch } from "./safe-fetch";

/**
 * docs/architecture/INGESTION.md "Fetch — ... respects robots.txt/terms
 * for Web/Sitemap connectors, never bypasses paywall/auth." A minimal,
 * correct subset of the de-facto robots.txt convention (RFC 9309's
 * group-matching + longest-prefix-wins rule): enough to honor real
 * sites' robots.txt, not a full spec implementation (wildcards/`$`
 * end-anchors in paths are out of scope for MVP).
 */

type Rule = { path: string; allow: boolean };
type Group = { userAgents: string[]; rules: Rule[] };

function parseGroups(robotsTxt: string): Group[] {
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);

  const groups: Group[] = [];
  let current: Group | null = null;
  let currentHasRules = false;

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "user-agent") {
      // A User-agent line after this group already collected rules starts
      // a new group; consecutive User-agent lines (no rules between them
      // yet) belong to the same group — the standard "OR" grouping.
      if (!current || currentHasRules) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
        currentHasRules = false;
      }
      current.userAgents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value !== "") current.rules.push({ path: value, allow: key === "allow" });
      currentHasRules = true;
    }
  }
  return groups;
}

function selectGroup(groups: Group[], userAgent: string): Group | null {
  const ua = userAgent.toLowerCase();
  const exact = groups.find((g) => g.userAgents.some((a) => a !== "*" && ua.includes(a)));
  if (exact) return exact;
  return groups.find((g) => g.userAgents.includes("*")) ?? null;
}

/** Pure — the parsing/matching logic, independent of how robots.txt was fetched. */
export function isPathAllowedByRobots(robotsTxt: string, userAgent: string, path: string): boolean {
  const group = selectGroup(parseGroups(robotsTxt), userAgent);
  if (!group) return true; // no applicable group -> nothing forbidden

  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!path.startsWith(rule.path)) continue;
    const better =
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow && !best.allow);
    if (better) best = rule;
  }
  return best ? best.allow : true;
}

const USER_AGENT = "CiM-Bot";

/**
 * Fetches and checks robots.txt for one URL. Fails OPEN (allowed) when
 * robots.txt itself is unreachable or absent — that mirrors every real
 * crawler's behavior (no robots.txt means no restriction, not "assume
 * blocked") and is a politeness/compliance check, not the SSRF security
 * boundary (`safeFetch`, used to fetch it, still enforces that
 * regardless of the outcome here).
 */
export async function isAllowedByRobotsTxt(targetUrl: string): Promise<boolean> {
  const parsed = new URL(targetUrl);
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  let body: string;
  try {
    const result = await safeFetch(robotsUrl, { timeoutMs: 5000 });
    if (result.status >= 400) return true;
    body = result.body;
  } catch {
    return true;
  }
  return isPathAllowedByRobots(body, USER_AGENT, parsed.pathname || "/");
}
