"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";
import { CONTINENTS, continentName, countryInScope, countryName, isContinentCode } from "@cim/core";
import { post, type BulkOutcome } from "./source-controls";

// The outlines are ~125 KB of path data — only this admin screen needs them, and only on the client.
const WorldMap = dynamic(() => import("@/components/world-map").then((m) => m.WorldMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl border border-border bg-surface-muted/40" aria-hidden="true" />,
});

type Item = {
  key: string;
  name: string;
  url: string;
  type: string;
  language: string;
  country: string;
  group: string;
  verified: boolean;
  manualOnly?: boolean;
  added: boolean;
};

const PAGE = 60;

function Row({ label, count, depth, active, onClick }: { label: string; count: number; depth: 0 | 1 | 2; active: boolean; onClick: () => void }) {
  return (
    <tr className={active ? "bg-primary/10" : undefined}>
      <th scope="row" className="p-0 text-left font-normal">
        <button
          type="button"
          aria-pressed={active}
          onClick={onClick}
          style={{ paddingLeft: `${0.75 + depth}rem` }}
          className={`w-full py-2 pr-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
            depth === 0 ? "font-semibold" : depth === 1 ? "font-medium" : "text-muted-foreground"
          }`}
        >
          {label}
        </button>
      </th>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{count}</td>
    </tr>
  );
}

/**
 * The world feed catalog, browsed by place: a map (hover / click a country) next to
 * a World → continent → country table, then category, search and "XML-checked only".
 * The list itself is fetched page by page from the server, so thousands of feeds
 * never travel to the browser at once. Every add is fetch-tested first.
 */
export function WorldCatalogBrowser({
  countryCounts,
  globalCount,
  groupLabels,
}: {
  countryCounts: Record<string, number>;
  globalCount: number;
  groupLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [continent, setContinent] = useState<string | null>(null); // continent code, "global" or null (= World)
  const [country, setCountry] = useState<string | null>(null);
  const region = country ?? continent ?? "world";
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);

  const activeContinent = continent && isContinentCode(continent) ? continent : null;
  const worldTotal = useMemo(() => Object.values(countryCounts).reduce((a, b) => a + b, 0) + globalCount, [countryCounts, globalCount]);
  const continentRows = useMemo(
    () =>
      CONTINENTS.map((c) => ({
        ...c,
        count: Object.entries(countryCounts).reduce((sum, [code, n]) => sum + (countryInScope(code, c.code) ? n : 0), 0),
      })).filter((c) => c.count > 0),
    [countryCounts],
  );
  const countryRows = useMemo(
    () =>
      activeContinent
        ? Object.entries(countryCounts)
            .filter(([code]) => countryInScope(code, activeContinent))
            .sort((a, b) => b[1] - a[1])
        : [],
    [countryCounts, activeContinent],
  );
  const regionLabel =
    region === "world" ? "World" : region === "global" ? "Global / country not confirmed" : isContinentCode(region) ? continentName(region) : countryName(region);

  const params = useCallback(
    (offset: number, limit: number) => {
      const p = new URLSearchParams({ region, offset: String(offset), limit: String(limit) });
      if (group) p.set("group", group);
      if (query.trim()) p.set("q", query.trim());
      if (verifiedOnly) p.set("verified", "1");
      return p;
    },
    [region, group, query, verifiedOnly],
  );

  // Reload the first page whenever a filter changes (search is debounced a little).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/admin/catalog?${params(0, PAGE)}`);
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as { total: number; items: Item[] };
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params]);

  async function showMore() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/catalog?${params(items.length, PAGE)}`);
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { total: number; items: Item[] };
      setItems((current) => [...current, ...data.items]);
      setTotal(data.total);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function addAll() {
    // Everything matching the filters (not just the rows on screen), up to 2000 at a time.
    const response = await fetch(`/api/admin/catalog?${params(0, 2000)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { total: number; items: Item[] };
    const queue = data.items.filter((item) => !item.added);
    if (queue.length === 0) return;
    if (
      !window.confirm(
        `Test and add ${queue.length} feeds${data.total > data.items.length ? ` (the first ${data.items.length} of ${data.total} matches)` : ""}? ` +
          "Each one is fetched first; feeds that can't be read are skipped. Add one region or category at a time and watch the job queue.",
      )
    ) {
      return;
    }
    setRunning(true);
    cancelRef.current = false;
    setCancelRequested(false);
    setOutcome(null);
    const result: BulkOutcome = { added: 0, skipped: 0, failed: [] };
    let done = 0;
    setProgress({ done: 0, total: queue.length });
    async function worker() {
      while (queue.length > 0 && !cancelRef.current) {
        const entry = queue.shift()!;
        try {
          const { ok, data: body } = await post("/api/admin/sources", {
            name: entry.name,
            url: entry.url,
            connector: "rss",
            type: entry.type,
            language: entry.language || "other",
            country: entry.country || "ZZ",
          });
          if (ok) result.added += 1;
          else if (body.code === "duplicate") result.skipped += 1;
          else result.failed.push({ name: entry.name, error: body.error ?? "Could not add." });
        } catch {
          result.failed.push({ name: entry.name, error: "Network error." });
        }
        done += 1;
        setProgress({ done, total: result.added + result.skipped + result.failed.length + queue.length });
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    setOutcome(result);
    setProgress(null);
    setRunning(false);
    router.refresh();
    // Refresh the "Added" marks on screen.
    setQuery((q) => q);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" role="group" aria-label="Catalog region">
        <WorldMap
          counts={countryCounts}
          continent={activeContinent}
          selected={country}
          labelFor={countryName}
          onSelect={(code) => {
            const owner = CONTINENTS.find((c) => countryInScope(code, c.code));
            setContinent(owner?.code ?? null);
            setCountry(country === code ? null : code);
          }}
        />
        <div className="max-h-[26rem] overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Catalog feeds by region. Select a row to list that region&apos;s feeds.</caption>
            <thead className="sticky top-0 border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Region · {regionLabel}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Feeds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row label="World" count={worldTotal} depth={0} active={region === "world"} onClick={() => { setContinent(null); setCountry(null); }} />
              {continentRows.map((c) => (
                <Fragment key={c.code}>
                  <Row label={c.name} count={c.count} depth={1} active={region === c.code} onClick={() => { setContinent(c.code); setCountry(null); }} />
                  {activeContinent === c.code
                    ? countryRows.map(([code, n]) => (
                        <Row key={code} label={countryName(code)} count={n} depth={2} active={country === code} onClick={() => setCountry(country === code ? null : code)} />
                      ))
                    : null}
                </Fragment>
              ))}
              {globalCount > 0 ? (
                <Row label="Global / country not confirmed" count={globalCount} depth={1} active={continent === "global"} onClick={() => { setContinent("global"); setCountry(null); }} />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="world-search">Find in world catalog</Label>
          <Input id="world-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Outlet or address" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="world-group">Topic of feed</Label>
          <select
            id="world-group"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All topics</option>
            {Object.entries(groupLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          XML-checked only
        </label>
        <Button type="button" variant="secondary" onClick={addAll} disabled={running || total === 0}>
          {running ? "Adding…" : `Test & add all matching (${total})`}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              cancelRef.current = true;
              setCancelRequested(true);
            }}
            disabled={cancelRequested}
          >
            {cancelRequested ? "Stopping…" : "Stop"}
          </Button>
        ) : null}
      </div>

      {progress ? (
        <p role="status" className="text-sm text-muted-foreground">
          Testing feeds… {progress.done} of {progress.total}
        </p>
      ) : null}
      {outcome ? (
        <div role="status" className="rounded-lg border border-border p-3 text-sm">
          <p className="text-foreground">
            Added {outcome.added}, already present {outcome.skipped}, could not add {outcome.failed.length}.
          </p>
          {outcome.failed.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">Show feeds that failed</summary>
              <ul className="mt-2 max-h-64 overflow-auto text-xs text-muted-foreground">
                {outcome.failed.map((item) => (
                  <li key={item.name + item.error}>
                    {item.name}: {item.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          Could not load the catalog. Try again.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {total} feeds in {regionLabel}
        {group ? ` · ${groupLabels[group] ?? group}` : ""}
        {loading ? " · loading…" : ""}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((entry) => (
          <li key={entry.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {entry.name}
                {entry.verified ? <span className="ml-2 rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">XML ✓</span> : null}
                {entry.manualOnly ? <span className="ml-2 rounded-sm bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Manual candidate</span> : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {entry.country ? countryName(entry.country) : "Global"} · {entry.url}
              </div>
            </div>
            {entry.added ? <span className="shrink-0 text-xs font-medium text-success">Added</span> : <WorldAddButton entry={entry} onAdded={() => setItems((cur) => cur.map((i) => (i.key === entry.key ? { ...i, added: true } : i)))} />}
          </li>
        ))}
      </ul>
      {items.length < total ? (
        <Button type="button" variant="ghost" onClick={showMore} disabled={loading}>
          Show more ({total - items.length} left)
        </Button>
      ) : null}
    </div>
  );
}

function WorldAddButton({ entry, onAdded }: { entry: Item; onAdded: () => void }) {
  const [state, setState] = useState<"idle" | "adding" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={state === "adding"}
        onClick={async () => {
          setState("adding");
          setError(null);
          try {
            const { ok, data } = await post("/api/admin/sources", {
              name: entry.name,
              url: entry.url,
              connector: "rss",
              type: entry.type,
              language: entry.language || "other",
              country: entry.country || "ZZ",
            });
            if (ok || data.code === "duplicate") {
              onAdded();
            } else {
              setState("error");
              setError(data.error ?? "Could not add.");
            }
          } catch {
            setState("error");
            setError("Network error. Please try again.");
          }
        }}
      >
        {state === "adding" ? "Testing…" : "Add feed"}
      </Button>
      {error ? (
        <span role="alert" className="max-w-48 text-right text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
