"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Label } from "@cim/ui";
import {
  CONTINENTS,
  continentName,
  countryInScope,
  countryName,
  isContinentCode,
  SOURCE_KINDS,
  sourceKindOfType,
  type SourceKindKey,
} from "@cim/core";
import { CrawlToggle } from "./source-controls";

export type ExplorerSource = {
  id: string;
  name: string;
  domain: string;
  type: string;
  connector: string;
  country: string | null;
  status: string;
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  healthy: "success",
  delayed: "warning",
  error: "danger",
  blocked: "danger",
  unavailable: "neutral",
};

const CRAWLABLE = new Set(["rss", "sitemap", "web", "api"]);
const PAGE = 40;

function chip(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-foreground hover:bg-surface-muted"
  }`;
}

async function bulk(body: unknown): Promise<{ ok: boolean; changed?: number; error?: string }> {
  const response = await fetch("/api/admin/sources/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { changed?: number; error?: string };
  return { ok: response.ok, ...data };
}

/**
 * The crawl-source overview: browse by region (World → continent → country) and
 * by kind of site (news, blogs, forums …), then pause or resume a whole slice —
 * or everything — in one click. Pausing never deletes a source or its mentions.
 */
export function SourceExplorer({ sources }: { sources: ExplorerSource[] }) {
  const router = useRouter();
  const [continent, setContinent] = useState<string | null>(null); // continent code, "unknown" or null (= World)
  const [country, setCountry] = useState<string | null>(null);
  const region = country ?? continent ?? "world";
  const [kinds, setKinds] = useState<SourceKindKey[]>([]);
  const [status, setStatus] = useState<"all" | "crawling" | "paused" | "problem">("all");
  const [search, setSearch] = useState("");
  const [shownPer, setShownPer] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const real = useMemo(() => sources.filter((s) => CRAWLABLE.has(s.connector)), [sources]);
  const isPaused = (s: ExplorerSource) => s.status === "unavailable";

  // Region tree counts always reflect the other filters except region itself.
  const needle = search.trim().toLocaleLowerCase("tr");
  const matchesNonRegion = (s: ExplorerSource) =>
    (kinds.length === 0 || kinds.includes(sourceKindOfType(s.type))) &&
    (status === "all" ||
      (status === "paused" && isPaused(s)) ||
      (status === "crawling" && !isPaused(s)) ||
      (status === "problem" && ["error", "blocked", "delayed"].includes(s.status))) &&
    (!needle || s.name.toLocaleLowerCase("tr").includes(needle) || s.domain.toLowerCase().includes(needle));

  const base = real.filter(matchesNonRegion);
  const continentCounts = CONTINENTS.map((c) => ({
    ...c,
    count: base.filter((s) => countryInScope(s.country, c.code)).length,
  })).filter((c) => c.count > 0);

  const activeContinent = continent && isContinentCode(continent) ? continent : null;
  const countryChips = useMemo(() => {
    if (!activeContinent) return [];
    const counts = new Map<string, number>();
    for (const s of base) {
      if (s.country && countryInScope(s.country, activeContinent)) {
        counts.set(s.country, (counts.get(s.country) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeContinent, sources, kinds, status, search]);

  const unknownCount = base.filter((s) => !s.country).length;
  const inRegion = base.filter((s) =>
    region === "unknown" ? !s.country : countryInScope(s.country, region),
  );
  const kindCounts = new Map<SourceKindKey, number>();
  for (const s of real) {
    if (!(region === "unknown" ? !s.country : countryInScope(s.country, region))) continue;
    if (!matchesStatusAndSearch(s)) continue;
    const k = sourceKindOfType(s.type);
    kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
  }
  function matchesStatusAndSearch(s: ExplorerSource) {
    return (
      (status === "all" ||
        (status === "paused" && isPaused(s)) ||
        (status === "crawling" && !isPaused(s)) ||
        (status === "problem" && ["error", "blocked", "delayed"].includes(s.status))) &&
      (!needle || s.name.toLocaleLowerCase("tr").includes(needle) || s.domain.toLowerCase().includes(needle))
    );
  }

  const totalCrawling = real.filter((s) => !isPaused(s)).length;
  const totalPaused = real.length - totalCrawling;
  const shownCrawling = inRegion.filter((s) => !isPaused(s));
  const shownPausedList = inRegion.filter(isPaused);
  const filteredByTextOrStatus = status !== "all" || needle.length > 0;

  const regionLabel =
    region === "world"
      ? "World"
      : region === "unknown"
        ? "Unknown region"
        : isContinentCode(region)
          ? continentName(region)
          : countryName(region);

  async function run(enabled: boolean, scopeDescription: string, list: ExplorerSource[], all = false) {
    if (list.length === 0) return;
    const verb = enabled ? "Resume" : "Pause";
    if (
      !window.confirm(
        `${verb} crawling for ${list.length} source${list.length === 1 ? "" : "s"} (${scopeDescription})? ` +
          (enabled
            ? "They will be checked again on the next crawl. Blocked publishers stay paused."
            : "Nothing is deleted — existing mentions stay, and you can resume at any time."),
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let changed = 0;
      if (all || (!filteredByTextOrStatus && region !== "unknown" && list === (enabled ? shownPausedList : shownCrawling))) {
        const result = await bulk({ enabled, region: all ? "world" : region, kinds: all ? [] : kinds });
        if (!result.ok) throw new Error(result.error ?? "Could not update.");
        changed = result.changed ?? 0;
      } else {
        const ids = list.map((s) => s.id);
        for (let i = 0; i < ids.length; i += 500) {
          const result = await bulk({ enabled, ids: ids.slice(i, i + 500) });
          if (!result.ok) throw new Error(result.error ?? "Could not update.");
          changed += result.changed ?? 0;
        }
      }
      setNotice({
        tone: "ok",
        text: `${enabled ? "Resumed" : "Paused"} ${changed} source${changed === 1 ? "" : "s"}.`,
      });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update." });
    } finally {
      setBusy(false);
    }
  }

  // Cluster the visible sources by kind.
  const clusters = SOURCE_KINDS.map((kind) => ({
    kind,
    items: inRegion.filter((s) => sourceKindOfType(s.type) === kind.key),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Master switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/50 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {totalCrawling} crawling · {totalPaused} paused
            <span className="font-normal text-muted-foreground"> of {real.length} sources</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Pausing keeps every source and its mentions — it only stops new fetching.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || totalCrawling === 0}
            onClick={() => run(false, "all regions and kinds", real.filter((s) => !isPaused(s)), true)}
          >
            Pause all crawling
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || totalPaused === 0}
            onClick={() => run(true, "all regions and kinds", real.filter(isPaused), true)}
          >
            Resume all
          </Button>
        </div>
      </div>

      {/* Region tree */}
      <div className="flex flex-col gap-2" role="group" aria-label="Region">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Region · {regionLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(region === "world")} aria-pressed={region === "world"} onClick={() => {
            setContinent(null);
            setCountry(null);
          }}>
            World <span className="opacity-70">{base.length}</span>
          </button>
          {continentCounts.map((c) => (
            <button
              key={c.code}
              type="button"
              className={chip(continent === c.code)}
              aria-pressed={continent === c.code}
              onClick={() => {
                setContinent(c.code);
                setCountry(null);
              }}
            >
              {c.name} <span className="opacity-70">{c.count}</span>
            </button>
          ))}
          {unknownCount > 0 ? (
            <button type="button" className={chip(continent === "unknown")} aria-pressed={continent === "unknown"} onClick={() => {
                setContinent("unknown");
                setCountry(null);
              }}>
              Unknown <span className="opacity-70">{unknownCount}</span>
            </button>
          ) : null}
        </div>
        {countryChips.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-l-2 border-border pl-3" role="group" aria-label="Countries">
            {countryChips.map(([code, count]) => (
              <button
                key={code}
                type="button"
                className={chip(country === code)}
                aria-pressed={country === code}
                onClick={() => setCountry(country === code ? null : code)}
              >
                {countryName(code)} <span className="opacity-70">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Kind + status + search */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of site">
          <button type="button" className={chip(kinds.length === 0)} aria-pressed={kinds.length === 0} onClick={() => setKinds([])}>
            All kinds
          </button>
          {SOURCE_KINDS.map((kind) => {
            const count = kindCounts.get(kind.key) ?? 0;
            if (count === 0 && !kinds.includes(kind.key)) return null;
            const active = kinds.includes(kind.key);
            return (
              <button
                key={kind.key}
                type="button"
                className={chip(active)}
                aria-pressed={active}
                onClick={() => setKinds(active ? kinds.filter((k) => k !== kind.key) : [...kinds, kind.key])}
              >
                {kind.label} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="src-search">Filter sources</Label>
            <Input id="src-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or address" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="src-status">Status</Label>
            <select
              id="src-status"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">Any status</option>
              <option value="crawling">Crawling</option>
              <option value="paused">Paused</option>
              <option value="problem">Needs attention</option>
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || shownCrawling.length === 0}
            onClick={() => run(false, `${regionLabel}${kinds.length ? " · selected kinds" : ""}`, shownCrawling)}
          >
            Pause the {shownCrawling.length} shown
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || shownPausedList.length === 0}
            onClick={() => run(true, `${regionLabel}${kinds.length ? " · selected kinds" : ""}`, shownPausedList)}
          >
            Resume the {shownPausedList.length} paused
          </Button>
        </div>
        {notice ? (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`text-sm ${notice.tone === "error" ? "text-danger" : "text-success"}`}>
            {notice.text}
          </p>
        ) : null}
      </div>

      {/* Clusters */}
      {clusters.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          {real.length === 0 ? "No sources yet — add some from the catalog above." : "No sources match these filters."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {clusters.map(({ kind, items }) => {
            const limit = shownPer[kind.key] ?? PAGE;
            const crawling = items.filter((s) => !isPaused(s)).length;
            return (
              <details key={kind.key} open className="rounded-xl border border-border">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                  <span>
                    {kind.label} <span className="font-normal text-muted-foreground">· {items.length}</span>
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {crawling} crawling · {items.length - crawling} paused
                  </span>
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {items.slice(0, limit).map((source) => (
                    <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{source.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {source.domain} · {countryName(source.country)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={STATUS_TONE[source.status] ?? "neutral"}>
                          {isPaused(source) ? "paused" : source.status}
                        </Badge>
                        {source.connector === "rss" || source.connector === "sitemap" ? (
                          <CrawlToggle id={source.id} name={source.name} paused={isPaused(source)} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {items.length > limit ? (
                  <div className="border-t border-border p-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShownPer((current) => ({ ...current, [kind.key]: limit + PAGE }))}
                    >
                      Show more ({items.length - limit} left)
                    </Button>
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
