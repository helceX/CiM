import type { MentionFilters } from "@cim/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns the Mentions URL's query parameters into repository filters — one
 * place, used by the page and by the "load one day" API so they can never
 * disagree about what a filter means. Anything malformed is ignored rather
 * than reaching Postgres.
 */
export function mentionFiltersFromParams(get: (key: string) => string | undefined | null, currentUserId: string): MentionFilters {
  const uuid = (key: string) => {
    const value = get(key) ?? "";
    return UUID_PATTERN.test(value) ? value : undefined;
  };
  const assigned = get("assigned");
  const since = get("since");
  return {
    search: get("q") || undefined,
    sentiment: (get("sentiment") || undefined) as MentionFilters["sentiment"],
    priority: (get("priority") || undefined) as MentionFilters["priority"],
    sinceDays: since ? Number(since) : undefined,
    // "me" is the only client-facing value; the id comes from the session.
    assignedToUserId: assigned === "me" ? currentUserId : undefined,
    unassignedOnly: assigned === "unassigned",
    tagId: get("tag") || undefined,
    queryId: uuid("query"),
    brandGroupId: uuid("group"),
  };
}
