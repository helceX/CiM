"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input, Select } from "@cim/ui";
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

type Preview = { rows: VisualRow[]; truncated: boolean };

export type VisualBuilderInitial = {
  id: string;
  name: string;
  measure: VisualMeasure;
  dimension: VisualDimension;
  periodDays: number;
  sentiments: Sentiment[];
  chartType: VisualChartType;
};

export function VisualBuilder({ initial }: { initial?: VisualBuilderInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [measure, setMeasure] = useState<VisualMeasure>(initial?.measure ?? "mentions");
  const [dimension, setDimension] = useState<VisualDimension>(initial?.dimension ?? "day");
  const [periodDays, setPeriodDays] = useState<number>(initial?.periodDays ?? 30);
  const [sentiments, setSentiments] = useState<Sentiment[]>(initial?.sentiments ?? []);
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
      filters: sentiments.length > 0 ? { sentiments } : {},
    }),
    [measure, dimension, periodDays, chartType, sentiments],
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

  function toggleSentiment(value: Sentiment) {
    setSentiments((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
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

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-4">
        <Field id="visual-name" label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly mention volume" maxLength={120} />
        </Field>
        <Field id="visual-measure" label="Measure">
          <Select value={measure} onChange={(e) => setMeasure(e.target.value as VisualMeasure)}>
            {VISUAL_MEASURES.map((m) => (
              <option key={m} value={m}>
                {MEASURE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="visual-dimension" label="Group by">
          <Select value={dimension} onChange={(e) => setDimension(e.target.value as VisualDimension)}>
            {VISUAL_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="visual-period" label="Period">
          <Select value={String(periodDays)} onChange={(e) => setPeriodDays(Number(e.target.value))}>
            {VISUAL_PERIOD_DAYS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </Select>
        </Field>
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
        <Field id="visual-chart-type" label="Show as">
          <Select value={chartType} onChange={(e) => setChartType(e.target.value as VisualChartType)}>
            {suggestions.map((t) => (
              <option key={t} value={t}>
                {CHART_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">{name.trim() || "Preview"}</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {MEASURE_LABELS[measure]} by {DIMENSION_LABELS[dimension].toLowerCase()}, last {periodDays} days
          </p>
          {previewError ? (
            <p role="alert" className="text-sm text-danger">
              {previewError}
            </p>
          ) : preview ? (
            <div aria-busy={isLoading} className={isLoading ? "opacity-60" : undefined}>
              <VisualView
                rows={preview.rows}
                truncated={preview.truncated}
                chartType={chartType}
                measure={measure}
                dimension={dimension}
                title={name.trim() || "Preview"}
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
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : initial ? "Save changes" : "Save visual"}
          </Button>
        </div>
      </div>
    </div>
  );
}
