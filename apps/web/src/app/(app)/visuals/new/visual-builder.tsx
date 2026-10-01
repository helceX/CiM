"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox } from "@cim/ui";
import { Activity, BarChart3, ChartPie, Clock, Layers, ListOrdered, Sparkles, Table2, TrendingUp } from "lucide-react";
import {
  DIMENSION_LABELS,
  MEASURE_LABELS,
  VISUAL_DIMENSIONS,
  VISUAL_MEASURES,
  VISUAL_PERIOD_DAYS,
  suggestChartTypes,
  type VisualChartType,
  type VisualDimension,
  type VisualMeasure,
  type VisualRow,
} from "@cim/core";
import { VisualView } from "@/components/charts/visual-view";

const SENTIMENTS = ["positive", "neutral", "negative"] as const;
type Sentiment = (typeof SENTIMENTS)[number];

const CHART_LABELS: Record<VisualChartType, string> = {
  line: "Line",
  area: "Area",
  bar: "Bar",
  stacked_bar: "Stacked bar",
  pie: "Pie",
  table: "Table",
};

const CHART_ICONS: Record<VisualChartType, React.ReactNode> = {
  line: <TrendingUp className="size-5" aria-hidden="true" />,
  area: <Activity className="size-5" aria-hidden="true" />,
  bar: <BarChart3 className="size-5" aria-hidden="true" />,
  stacked_bar: <Layers className="size-5" aria-hidden="true" />,
  pie: <ChartPie className="size-5" aria-hidden="true" />,
  table: <Table2 className="size-5" aria-hidden="true" />,
};

const MEASURE_HINTS: Record<VisualMeasure, string> = {
  mentions: "How much coverage",
  unique_sources: "How wide it spreads",
  high_priority: "What needs attention",
  negative_share: "How much of it is bad",
};

/** One-click starting points — each answers a question people actually ask. */
const PRESETS: {
  name: string;
  question: string;
  measure: VisualMeasure;
  dimension: VisualDimension;
  periodDays: number;
  chartType: VisualChartType;
  sentiments?: Sentiment[];
}[] = [
  { name: "Daily coverage", question: "How loud were we this month?", measure: "mentions", dimension: "day", periodDays: 30, chartType: "area" },
  { name: "Where we show up", question: "Which outlets carry us?", measure: "mentions", dimension: "source", periodDays: 30, chartType: "bar" },
  { name: "Tone of voice", question: "Is the mood positive or negative?", measure: "mentions", dimension: "sentiment", periodDays: 30, chartType: "pie" },
  { name: "Risk watch", question: "Where is it going wrong?", measure: "negative_share", dimension: "week", periodDays: 90, chartType: "line" },
  { name: "Who owns the story", question: "How do our groups compare?", measure: "mentions", dimension: "brand_group", periodDays: 30, chartType: "bar" },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mp-glass p-4">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-bold text-foreground">
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-full text-xs font-extrabold text-white"
          style={{ background: "var(--mp-gradient-solid)" }}
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A radio that looks like a chip/tile. The real <input> stays in the tab order. */
function Choice({
  name,
  value,
  checked,
  onChange,
  children,
  className = "",
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`relative cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-cyan)] ${
        checked ? "border-transparent text-white" : "border-border bg-background/40 text-foreground hover:bg-surface-muted"
      } ${className}`}
      style={checked ? { background: "var(--mp-gradient-solid)" } : undefined}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

type Preview = { rows: VisualRow[]; truncated: boolean };

export type FilterOption = { id: string; name: string };

export type VisualBuilderInitial = {
  id: string;
  name: string;
  measure: VisualMeasure;
  dimension: VisualDimension;
  periodDays: number;
  sentiments: Sentiment[];
  brandGroupIds: string[];
  queryIds: string[];
  chartType: VisualChartType;
};

export function VisualBuilder({
  initial,
  brandGroups = [],
  queries = [],
}: {
  initial?: VisualBuilderInitial;
  brandGroups?: FilterOption[];
  queries?: FilterOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [measure, setMeasure] = useState<VisualMeasure>(initial?.measure ?? "mentions");
  const [dimension, setDimension] = useState<VisualDimension>(initial?.dimension ?? "day");
  const [periodDays, setPeriodDays] = useState<number>(initial?.periodDays ?? 30);
  const [sentiments, setSentiments] = useState<Sentiment[]>(initial?.sentiments ?? []);
  const [brandGroupIds, setBrandGroupIds] = useState<string[]>(initial?.brandGroupIds ?? []);
  const [queryIds, setQueryIds] = useState<string[]>(initial?.queryIds ?? []);
  const [chartType, setChartType] = useState<VisualChartType>(initial?.chartType ?? "line");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const spec = useMemo(
    () => ({
      measure,
      dimension,
      periodDays,
      chartType,
      filters: {
        ...(sentiments.length > 0 ? { sentiments } : {}),
        ...(brandGroupIds.length > 0 ? { brandGroupIds } : {}),
        ...(queryIds.length > 0 ? { queryIds } : {}),
      },
    }),
    [measure, dimension, periodDays, chartType, sentiments, brandGroupIds, queryIds],
  );

  const suggestions = suggestChartTypes({ measure, dimension }, preview?.rows.length ?? 0);

  // Keep the chosen form valid for the data shape (e.g. no pie for a time series).
  useEffect(() => {
    if (!suggestions.includes(chartType)) setChartType(suggestions[0] ?? "table");
  }, [suggestions, chartType]);

  // Live preview, debounced so dragging through options doesn't hammer the API.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setPreviewError(null);
      try {
        const response = await fetch("/api/visuals/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(spec),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setPreviewError(data.error ?? "Couldn't compute this preview.");
          setPreview(null);
          return;
        }
        setPreview(data);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setPreviewError("Couldn't compute this preview.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [spec]);

  const toggleIn = (setter: (fn: (current: string[]) => string[]) => void, id: string) =>
    setter((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));

  function toggleSentiment(value: Sentiment) {
    setSentiments((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setName((current) => current || preset.name);
    setMeasure(preset.measure);
    setDimension(preset.dimension);
    setPeriodDays(preset.periodDays);
    setChartType(preset.chartType);
    setSentiments(preset.sentiments ?? []);
    // The old preview's row count would veto the preset's chart form (e.g. a pie) before the new data arrives.
    setPreview(null);
  }

  async function handleSave() {
    setSaveError(null);
    if (!name.trim()) {
      setSaveError("Give this visual a name first.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(initial ? `/api/visuals/${initial.id}` : "/api/visuals", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: chartType === "table" ? "table" : "chart", spec }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/visuals/${initial ? initial.id : data.visualId}`);
      router.refresh();
    } catch {
      setSaveError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const filterCount = sentiments.length + brandGroupIds.length + queryIds.length;
  const title = name.trim() || "Untitled visual";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="presets-heading">
        <h2 id="presets-heading" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" /> Start from a question
        </h2>
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {PRESETS.map((preset) => (
            <li key={preset.name} className="shrink-0">
              <button
                type="button"
                onClick={() => applyPreset(preset)}
                className="mp-glass block h-full w-48 p-3 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className="block text-sm font-bold text-foreground">{preset.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{preset.question}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Step n={1} title="What do you want to measure?">
            <div role="radiogroup" aria-label="Measure" className="grid grid-cols-2 gap-2">
              {VISUAL_MEASURES.map((m) => (
                <Choice key={m} name="measure" value={m} checked={measure === m} onChange={() => setMeasure(m)}>
                  <span className="block font-semibold">{MEASURE_LABELS[m]}</span>
                  <span className={`block text-xs ${measure === m ? "text-white/85" : "text-muted-foreground"}`}>{MEASURE_HINTS[m]}</span>
                </Choice>
              ))}
            </div>
          </Step>

          <Step n={2} title="Break it down by">
            <div role="radiogroup" aria-label="Group by" className="flex flex-wrap gap-2">
              {VISUAL_DIMENSIONS.map((d) => (
                <Choice key={d} name="dimension" value={d} checked={dimension === d} onChange={() => setDimension(d)}>
                  {DIMENSION_LABELS[d]}
                </Choice>
              ))}
            </div>
          </Step>

          <Step n={3} title="Over what period?">
            <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-2">
              {VISUAL_PERIOD_DAYS.map((d) => (
                <Choice key={d} name="period" value={String(d)} checked={periodDays === d} onChange={() => setPeriodDays(d)}>
                  <Clock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                  {d === 365 ? "1 year" : `${d} days`}
                </Choice>
              ))}
            </div>
          </Step>

          <Step n={4} title="How should it look?">
            <div role="radiogroup" aria-label="Show as" className="grid grid-cols-3 gap-2">
              {suggestions.map((t) => (
                <Choice key={t} name="chartType" value={t} checked={chartType === t} onChange={() => setChartType(t)} className="text-center">
                  <span className="mb-1 flex justify-center">{CHART_ICONS[t]}</span>
                  <span className="block text-xs font-semibold">{CHART_LABELS[t]}</span>
                </Choice>
              ))}
            </div>
          </Step>

          <details className="mp-glass group p-4" open={filterCount > 0}>
            <summary className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-foreground">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full text-xs font-extrabold text-white"
                style={{ background: "var(--mp-gradient-solid)" }}
              >
                5
              </span>
              Narrow it down <span className="font-normal text-muted-foreground">{filterCount > 0 ? `· ${filterCount} filter${filterCount === 1 ? "" : "s"}` : "· optional"}</span>
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-foreground">Only these sentiments</legend>
                <div className="flex flex-wrap gap-4">
                  {SENTIMENTS.map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm capitalize text-foreground">
                      <Checkbox checked={sentiments.includes(value)} onCheckedChange={() => toggleSentiment(value)} />
                      {value}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Leave all unchecked to include every mention.</p>
              </fieldset>
              {brandGroups.length > 0 ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-foreground">Only these brand groups</legend>
                  <div className="flex flex-col gap-1.5">
                    {brandGroups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox checked={brandGroupIds.includes(group.id)} onCheckedChange={() => toggleIn(setBrandGroupIds, group.id)} />
                        {group.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {queries.length > 0 ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-foreground">Only these monitoring queries</legend>
                  <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto" role="group" aria-label="Monitoring queries">
                    {queries.map((query) => (
                      <label key={query.id} className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox checked={queryIds.includes(query.id)} onCheckedChange={() => toggleIn(setQueryIds, query.id)} />
                        {query.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </div>
          </details>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="mp-hero p-5">
            <div className="relative">
              <label htmlFor="visual-name" className="sr-only">
                Name
              </label>
              <input
                id="visual-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name your visual…"
                maxLength={120}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-2xl font-extrabold tracking-tight text-foreground placeholder:text-muted-foreground/60 hover:border-border focus:border-border"
              />
              <p className="mt-1 flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
                <ListOrdered className="size-3.5" aria-hidden="true" />
                {MEASURE_LABELS[measure]} by {DIMENSION_LABELS[dimension].toLowerCase()} · last {periodDays} days
              </p>
            </div>
          </div>

          <div className="mp-glass p-5">
            {previewError ? (
              <p role="alert" className="text-sm text-danger">
                {previewError}
              </p>
            ) : preview ? (
              <div aria-busy={isLoading} className={isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <VisualView
                  rows={preview.rows}
                  truncated={preview.truncated}
                  chartType={chartType}
                  measure={measure}
                  dimension={dimension}
                  title={title}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Computing…</p>
            )}
          </div>

          {saveError ? (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">The preview updates as you change options.</p>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : initial ? "Save changes" : "Save visual"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
