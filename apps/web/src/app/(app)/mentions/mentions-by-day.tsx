"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge, Button } from "@cim/ui";
import { ChevronRight, ExternalLink } from "lucide-react";
import { SOURCE_KINDS, conceptKey, conceptOfTerm, countryName, sourceKindOfType, sourceTypeBadge, type ArticlePrint } from "@cim/core";
import type { MentionDaySummary, Tag } from "@cim/db";
import { FilterBar } from "@/components/filter-bar";
import { MentionDetailDrawer, type AssignableMember } from "./mention-detail-drawer";
import { buildMentionSelects } from "./mention-filter-config";
import { PrintLine } from "./print-clipping";

type DayItem = {
  id: string;
  queryId: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: string;
  sourceCountry: string | null;
  publishedAt: string;
  matchedTerms: string[];
  sentiment: string | null;
  priority: string;
  assigneeName: string | null;
  print: ArticlePrint | null;
};
type DayFamily = { key: string; label: string; mapped: boolean };
type DayQuery = { id: string; name: string; terms: string[]; aliasGroups: string[][]; family: DayFamily };
type DayState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: DayItem[]; queries: DayQuery[]; totals: Record<string, number> };

const SENTIMENT_TONE = { positive: "success", neutral: "neutral", negative: "danger" } as const;
const TYPE_TONE: Record<string, string> = {
  news: "bg-violet-500/15 text-violet-300",
  newspaper: "bg-amber-500/15 text-amber-300",
  magazine: "bg-pink-500/15 text-pink-300",
  press: "bg-sky-500/15 text-sky-300",
};

/** "Wednesday, 1 October 2026" for a YYYY-MM-DD day, with Today / Yesterday where they apply. */
function dayLabel(day: string): { title: string; relative: string | null } {
  const date = new Date(`${day}T12:00:00Z`);
  const title = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const todayIstanbul = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  return { title, relative: day === todayIstanbul ? "Today" : day === yesterday ? "Yesterday" : null };
}

/** Per-cluster counts of a collapsed day, in the fixed cluster order. */
function clusterCounts(byType: Record<string, number>) {
  const counts = new Map<string, number>();
  for (const [type, n] of Object.entries(byType)) {
    const key = sourceKindOfType(type);
    counts.set(key, (counts.get(key) ?? 0) + n);
  }
  return SOURCE_KINDS.filter((kind) => counts.has(kind.key)).map((kind) => ({ ...kind, count: counts.get(kind.key)! }));
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_TONE[type] ?? "bg-secondary text-secondary-foreground"}`}
    >
      {sourceTypeBadge(type)}
    </span>
  );
}

function ItemList({ items, onOpen }: { items: DayItem[]; onOpen: (id: string) => void }) {
  return (
      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={item.sourceType} />
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="rounded-sm text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {item.title}
                  <span className="sr-only"> — open details</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.sourceName}
                {item.sourceCountry ? ` · ${countryName(item.sourceCountry)}` : ""} ·{" "}
                <time dateTime={item.publishedAt}>
                  {new Date(item.publishedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}
                </time>
              </p>
              {item.print ? (
                <p className="mt-1">
                  <PrintLine print={item.print} />
                  {item.print.pageUrl ? (
                    <>
                      {" "}
                      <a
                        href={item.print.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline underline-offset-2"
                      >
                        View page<span className="sr-only"> of {item.print.publication} (new tab)</span>
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              {item.matchedTerms.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Matched keywords">
                  {item.matchedTerms.slice(0, 4).map((term) => (
                    <li key={term} className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                      {term}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.sentiment ? (
                <Badge tone={SENTIMENT_TONE[item.sentiment as keyof typeof SENTIMENT_TONE] ?? "neutral"}>{item.sentiment}</Badge>
              ) : null}
              {item.priority !== "normal" ? <Badge tone={item.priority === "low" ? "neutral" : "warning"}>{item.priority}</Badge> : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
              >
                Open story<span className="sr-only"> “{item.title}” on {item.sourceName} (new tab)</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ul>
  );
}

type ConceptGroup = { key: string; label: string; variants: string[]; items: DayItem[]; order: number };

/** A monitoring's stories split by the thing they are about: names of one concept stay together. */
function groupByConcept(query: DayQuery, items: DayItem[]): ConceptGroup[] {
  const byKey = new Map<string, ConceptGroup>();
  for (const item of items) {
    const term = item.matchedTerms[0];
    const concept = term ? conceptOfTerm(query.aliasGroups, term) : { label: "Other", variants: ["Other"] };
    const key = conceptKey(concept.label);
    let group = byKey.get(key);
    if (!group) {
      const variantKeys = new Set(concept.variants.map(conceptKey));
      const position = query.terms.findIndex((candidate) => variantKeys.has(conceptKey(candidate)));
      group = { key, label: concept.label, variants: concept.variants, items: [], order: position < 0 ? Number.MAX_SAFE_INTEGER : position };
      byKey.set(key, group);
    }
    group.items.push(item);
  }
  return [...byKey.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function KindClusters({ items, onOpen }: { items: DayItem[]; onOpen: (id: string) => void }) {
  return (
    <>
      {SOURCE_KINDS.map((kind) => ({
        kind,
        kindItems: items.filter((item) => sourceKindOfType(item.sourceType) === kind.key),
      }))
        .filter((cluster) => cluster.kindItems.length > 0)
        .map(({ kind, kindItems }) => (
          <details key={kind.key} open className="rounded-lg border border-border/70">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{kind.label}</span>
              <span className="font-normal normal-case">{kindItems.length}</span>
            </summary>
            <ItemList items={kindItems} onOpen={onOpen} />
          </details>
        ))}
    </>
  );
}

function storyCount(shown: number, total: number): string {
  if (total > shown) return `newest ${shown} of ${total} stories`;
  return `${total} ${total === 1 ? "story" : "stories"}`;
}

function MonitoringBlock({
  query,
  items,
  total,
  onOpen,
}: {
  query: DayQuery;
  items: DayItem[];
  /** Every story this monitoring has on the day; more than `items.length` when the day shows only the newest. */
  total: number;
  onOpen: (id: string) => void;
}) {
  const concepts = groupByConcept(query, items);
  return (
    <details className="rounded-xl border border-border bg-background/30">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-foreground">
        <span className="min-w-0 truncate">{query.name}</span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">{storyCount(items.length, total)}</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border p-2">
        {total > items.length ? (
          <p className="px-1 text-xs text-muted-foreground">
            This monitoring found {total} stories on this day; the newest {items.length} are listed — narrow the filters to see the rest.
          </p>
        ) : null}
        {concepts.length <= 1 ? (
          <KindClusters items={items} onOpen={onOpen} />
        ) : (
          concepts.map((concept) => (
            <details key={concept.key} className="rounded-lg border border-border">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {concept.label}
                  {concept.variants.length > 1 ? (
                    <span className="flex flex-wrap gap-1" aria-label="Names of this keyword">
                      {concept.variants.slice(1).map((variant) => (
                        <span key={variant} className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-secondary-foreground">
                          {variant}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {concept.items.length} {concept.items.length === 1 ? "story" : "stories"}
                </span>
              </summary>
              <div className="flex flex-col gap-2 border-t border-border p-2">
                <KindClusters items={concept.items} onOpen={onOpen} />
              </div>
            </details>
          ))
        )}
      </div>
    </details>
  );
}

function DayBody({ state, onOpen }: { state: DayState | undefined; onOpen: (id: string) => void }) {
  if (!state || state.status === "loading") return <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>;
  if (state.status === "error") {
    return (
      <p role="alert" className="px-4 py-6 text-sm text-danger">
        Couldn&apos;t load this day. Close and open it again.
      </p>
    );
  }
  // Read in layers, each closed until opened: monitorings of one family (BTM Monitoring v1, v2, v3 — or the
  // group the customer filed them under) share one cluster; inside it each monitoring; inside that the
  // things it tracks (forms of one word, or several names of one entity, are one concept); inside that the
  // kind of place (news & press, blogs, forums, social, broadcast). A family of one is shown as that monitoring.
  const perQuery = state.queries
    .map((query) => {
      const items = state.items.filter((item) => item.queryId === query.id);
      return { query, items, total: Math.max(items.length, state.totals[query.id] ?? 0) };
    })
    .filter((group) => group.items.length > 0);
  const families: { family: DayFamily; members: typeof perQuery }[] = [];
  for (const entry of perQuery) {
    const existing = families.find((f) => f.family.key === entry.query.family.key);
    if (existing) existing.members.push(entry);
    else families.push({ family: entry.query.family, members: [entry] });
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      {families.map(({ family, members }) =>
        members.length === 1 ? (
          <MonitoringBlock key={members[0]!.query.id} query={members[0]!.query} items={members[0]!.items} total={members[0]!.total} onOpen={onOpen} />
        ) : (
          <details key={family.key} className="rounded-xl border border-border bg-background/30">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-foreground">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate">{family.label}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {members.length} monitorings
                </span>
              </span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {members.reduce((sum, m) => sum + m.total, 0)} stories
              </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-2">
              {members.map(({ query, items, total }) => (
                <MonitoringBlock key={query.id} query={query} items={items} total={total} onOpen={onOpen} />
              ))}
            </div>
          </details>
        ),
      )}
    </div>
  );
}

/**
 * Mentions grouped by day: every day is one collapsed button (date, how many
 * stories, how many per cluster). Opening a day loads just that day and groups
 * it by kind of place — news & press (digital news, agencies, newspapers and
 * magazines, each with its own badge), blogs, forums, social, broadcast.
 */
export function MentionsByDay({
  days,
  totalDays,
  page,
  pageSize,
  members,
  tags,
  brandGroups,
  currentUserId,
  queryName,
}: {
  days: MentionDaySummary[];
  totalDays: number;
  page: number;
  pageSize: number;
  members: AssignableMember[];
  tags: Tag[];
  brandGroups: { id: string; name: string }[];
  currentUserId: string;
  queryName?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, DayState>>({});
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const totalPages = Math.max(1, Math.ceil(totalDays / pageSize));

  async function load(day: string) {
    if (inFlight.current.has(day)) return;
    inFlight.current.add(day);
    setLoaded((current) => ({ ...current, [day]: { status: "loading" } }));
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      params.delete("view");
      params.set("day", day);
      const response = await fetch(`/api/mentions/day?${params.toString()}`);
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { items: DayItem[]; queries: DayQuery[]; totals: Record<string, number> };
      setLoaded((current) => ({
        ...current,
        [day]: { status: "ready", items: data.items, queries: data.queries, totals: data.totals ?? {} },
      }));
    } catch {
      setLoaded((current) => ({ ...current, [day]: { status: "error" } }));
    } finally {
      inFlight.current.delete(day);
    }
  }

  function toggle(day: string) {
    const next = !open[day];
    setOpen((current) => ({ ...current, [day]: next }));
    if (next && loaded[day]?.status !== "ready") void load(day);
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearQuery() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("query");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-4">
      {queryName ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Showing only mentions from monitoring
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            {queryName}
            <button
              type="button"
              onClick={clearQuery}
              aria-label={`Show all monitoring, not just ${queryName}`}
              className="text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </span>
        </p>
      ) : null}
      <FilterBar extraKeys={["query"]} searchPlaceholder="Search mentions…" selects={buildMentionSelects(tags, brandGroups)} />

      {days.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No mentions match your filters. Try widening the date range or clearing a filter. Keywords match whole words and their usual endings, so a short abbreviation will not match inside longer words.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {days.map((day) => {
            const { title, relative } = dayLabel(day.day);
            const isOpen = Boolean(open[day.day]);
            const panelId = `day-${day.day}`;
            return (
              <li key={day.day} className="rounded-2xl border border-border bg-surface/60">
                <h2>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(day.day)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-foreground">
                        {relative ? <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">{relative}</span> : null}
                        {title}
                      </span>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                      {clusterCounts(day.byType).map((cluster) => (
                        <span key={cluster.key} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {cluster.label} <span className="font-semibold text-foreground">{cluster.count}</span>
                        </span>
                      ))}
                      <span className="pl-1 text-sm font-semibold tabular-nums text-foreground">
                        {day.total} {day.total === 1 ? "story" : "stories"}
                      </span>
                    </span>
                  </button>
                </h2>
                {isOpen ? (
                  <div id={panelId} className="border-t border-border pt-3">
                    <DayBody state={loaded[day.day]} onOpen={setSelectedMentionId} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Days {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Newer days
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Older days
            </Button>
          </div>
        </div>
      ) : null}

      {selectedMentionId ? (
        <MentionDetailDrawer
          mentionId={selectedMentionId}
          members={members}
          existingTagNames={tags.map((tag) => tag.name)}
          currentUserId={currentUserId}
          onClose={() => setSelectedMentionId(null)}
        />
      ) : null}
    </div>
  );
}
