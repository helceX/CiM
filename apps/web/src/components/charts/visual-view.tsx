"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  type VisualChartType,
  type VisualDimension,
  type VisualMeasure,
  type VisualRow,
} from "@cim/core";

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 6,
  fontSize: 12,
} as const;

const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" } as const;

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
  label,
}: {
  rows: VisualRow[];
  chartType: Exclude<VisualChartType, "table">;
  measure: VisualMeasure;
  label: string;
}) {
  const data = rows.map((row) => ({ label: row.label, value: row.value }));
  const tooltip = (
    <Tooltip
      formatter={(value) => [formatValue(value === undefined ? null : Number(value), measure), MEASURE_LABELS[measure]]}
      contentStyle={tooltipStyle}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--color-border)" />;
  const xAxis = (
    <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} minTickGap={16} />
  );
  const yAxis = <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />;
  const margin = { top: 8, right: 8, left: 0, bottom: 0 };

  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={260}>
        {chartType === "line" ? (
          <LineChart data={data} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} />
          </LineChart>
        ) : chartType === "area" ? (
          <AreaChart data={data} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Area type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} fill="var(--color-primary)" fillOpacity={0.15} />
          </AreaChart>
        ) : chartType === "pie" ? (
          <PieChart>
            {tooltip}
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={90} stroke="var(--color-surface)" strokeWidth={2} label={(entry) => entry.name}>
              {data.map((_, index) => (
                // Fixed categorical order, never cycled: a pie is capped at 6 slices upstream.
                <Cell key={index} fill={`var(--group-${BRAND_GROUP_COLORS[index % BRAND_GROUP_COLORS.length]})`} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={data} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
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

  return (
    <div className="flex flex-col gap-2">
      {tooManySlices ? (
        <p className="text-xs text-muted-foreground">
          A pie chart shows at most {VISUAL_PIE_MAX_SLICES} slices; showing the table instead.
        </p>
      ) : null}
      {showTable ? (
        <VisualTable rows={rows} measure={measure} caption={label} />
      ) : (
        <VisualPlot rows={rows} chartType={effective as Exclude<VisualChartType, "table">} measure={measure} label={label} />
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
