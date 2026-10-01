"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@cim/ui";
import {
  BRAND_GROUP_COLORS,
  MEASURE_LABELS,
  VISUAL_PIE_MAX_SLICES,
  isTimeDimension,
  summarizeVisualRows,
  type VisualChartType,
  type VisualDimension,
  type VisualMeasure,
  type VisualRow,
} from "@cim/core";
import { axisTick, ChartTip, GradientDefs, gridStroke, Highlight, SIGNAL_TO, tooltipWrapper } from "./chart-kit";

function formatValue(value: number | null, measure: VisualMeasure): string {
  if (value === null) return "—";
  return measure === "negative_share" ? `${value}%` : String(value);
}

function VisualTable({ rows, measure, caption }: { rows: VisualRow[]; measure: VisualMeasure; caption: string }) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="max-h-96 overflow-auto rounded border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Group
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {MEASURE_LABELS[measure]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-foreground">
                {row.label}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{formatValue(row.value, measure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisualPlot({
  rows,
  chartType,
  measure,
  dimension,
  label,
}: {
  rows: VisualRow[];
  chartType: Exclude<VisualChartType, "table">;
  measure: VisualMeasure;
  dimension: VisualDimension;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const data = rows.map((row) => ({ label: row.label, value: row.value }));
  const time = isTimeDimension(dimension);
  const measureLabel = MEASURE_LABELS[measure];
  const fmt = (value: unknown) => formatValue(value === undefined || value === null ? null : Number(value), measure);
  const shortLabel = (value: string) =>
    time ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : value;
  const tip = (
    <Tooltip
      wrapperStyle={tooltipWrapper}
      cursor={chartType === "bar" ? { fill: "rgb(255 255 255 / 0.05)" } : { stroke: "var(--color-border-strong)", strokeDasharray: "4 4" }}
      content={({ active, payload, label: l }) =>
        active && payload?.length ? (
          <ChartTip
            title={time ? new Date(String(l)).toLocaleDateString() : String(payload[0]?.payload?.label ?? l ?? "")}
            rows={[{ color: SIGNAL_TO, label: measureLabel, value: fmt(payload[0]?.value) }]}
          />
        ) : null
      }
    />
  );
  const grid = <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 5" />;
  const xAxis = (
    <XAxis dataKey="label" tickFormatter={shortLabel} tick={axisTick} axisLine={false} tickLine={false} minTickGap={20} />
  );
  const yAxis = <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />;
  const margin = { top: 14, right: 12, left: 0, bottom: 0 };

  if (chartType === "pie") {
    const total = data.reduce((sum, d) => sum + (d.value ?? 0), 0);
    return (
      <div role="img" aria-label={label} className="grid items-center gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
        <div className="relative h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                wrapperStyle={tooltipWrapper}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTip
                      title={String(payload[0]?.name ?? "")}
                      rows={[{ color: String(payload[0]?.payload?.fill ?? ""), label: measureLabel, value: fmt(payload[0]?.value) }]}
                    />
                  ) : null
                }
              />
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="94%" paddingAngle={3} cornerRadius={6} stroke="none">
                {data.map((_, index) => (
                  // Fixed categorical order, never cycled: a pie is capped at 6 slices upstream.
                  <Cell key={index} fill={`var(--group-${BRAND_GROUP_COLORS[index % BRAND_GROUP_COLORS.length]})`} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground">{total}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">total</div>
            </div>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {data.map((d, index) => (
            <li key={d.label} className="flex items-center gap-3 text-sm">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: `var(--group-${BRAND_GROUP_COLORS[index % BRAND_GROUP_COLORS.length]})` }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{d.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{fmt(d.value)}</span>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {total > 0 && d.value !== null ? `${Math.round((d.value / total) * 100)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Categories (a source, a query…) read best as ranked horizontal bars with the value at the end.
  if (chartType === "bar" && !time) {
    return (
      <div role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
            <GradientDefs id={id} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "var(--color-foreground)" }} axisLine={false} tickLine={false} />
            {tip}
            <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22} fill={`url(#${id}-hbar)`} background={{ fill: "rgb(255 255 255 / 0.04)", radius: 8 }}>
              <LabelList dataKey="value" position="right" formatter={fmt} fill="var(--color-foreground)" fontSize={12} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={280}>
        {chartType === "line" ? (
          <LineChart data={data} margin={margin}>
            <GradientDefs id={id} />
            {grid}
            {xAxis}
            {yAxis}
            {tip}
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${id}-stroke)`}
              strokeWidth={3}
              dot={data.length <= 24 ? { r: 3, fill: "var(--color-surface)", stroke: SIGNAL_TO, strokeWidth: 2 } : false}
              activeDot={{ r: 6, fill: SIGNAL_TO, stroke: "var(--color-surface)", strokeWidth: 2 }}
              connectNulls={false}
              style={{ filter: "drop-shadow(0 4px 10px rgb(255 79 163 / 0.35))" }}
            />
          </LineChart>
        ) : chartType === "area" ? (
          <AreaChart data={data} margin={margin}>
            <GradientDefs id={id} />
            {grid}
            {xAxis}
            {yAxis}
            {tip}
            <Area
              type="monotone"
              dataKey="value"
              stroke={`url(#${id}-stroke)`}
              strokeWidth={3}
              fill={`url(#${id}-fill)`}
              activeDot={{ r: 6, fill: SIGNAL_TO, stroke: "var(--color-surface)", strokeWidth: 2 }}
              style={{ filter: "drop-shadow(0 4px 10px rgb(255 79 163 / 0.3))" }}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={margin} barCategoryGap="24%">
            <GradientDefs id={id} />
            {grid}
            {xAxis}
            {yAxis}
            {tip}
            <Bar dataKey="value" fill={`url(#${id}-bar)`} radius={[8, 8, 0, 0]} maxBarSize={34}>
              {data.length <= 14 ? (
                <LabelList dataKey="value" position="top" formatter={fmt} fill="var(--color-foreground)" fontSize={11} fontWeight={700} />
              ) : null}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Renders a computed visual as a chart, with the same numbers always
 * available as a table (screen readers, exact values, and the fallback when
 * a chart form doesn't suit the data). Pies are refused beyond 6 slices.
 */
export function VisualView({
  rows,
  chartType,
  measure,
  dimension,
  title,
  truncated = false,
}: {
  rows: VisualRow[];
  chartType: VisualChartType;
  measure: VisualMeasure;
  dimension: VisualDimension;
  title: string;
  truncated?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this period.</p>;
  }

  const tooManySlices = chartType === "pie" && rows.length > VISUAL_PIE_MAX_SLICES;
  const effective: VisualChartType = tooManySlices ? "table" : chartType;
  const showTable = asTable || effective === "table";
  const label = `${title}: ${MEASURE_LABELS[measure]} by ${dimension.replace("_", " ")}`;

  const highlights = summarizeVisualRows(rows, { measure, dimension });
  const time = isTimeDimension(dimension);
  const pretty = (value: string) => (time ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : value);

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {highlights.total !== null ? <Highlight label="Total" value={String(highlights.total)} /> : null}
        {highlights.peak ? (
          <Highlight label="Peak" value={formatValue(highlights.peak.value, measure)} hint={pretty(highlights.peak.label)} />
        ) : null}
        {highlights.average !== null ? <Highlight label="Average" value={formatValue(highlights.average, measure)} hint="per bucket" /> : null}
        {highlights.latest !== null ? <Highlight label="Latest" value={formatValue(highlights.latest, measure)} /> : null}
      </dl>
      {tooManySlices ? (
        <p className="text-xs text-muted-foreground">
          A pie chart shows at most {VISUAL_PIE_MAX_SLICES} slices; showing the table instead.
        </p>
      ) : null}
      {showTable ? (
        <VisualTable rows={rows} measure={measure} caption={label} />
      ) : (
        <VisualPlot
          rows={rows}
          chartType={effective as Exclude<VisualChartType, "table">}
          measure={measure}
          dimension={dimension}
          label={label}
        />
      )}
      {truncated ? <p className="text-xs text-muted-foreground">Showing the first {rows.length} rows.</p> : null}
      {effective !== "table" ? (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? "View as chart" : "View as table"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
