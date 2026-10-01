"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SentimentTrendPoint } from "@cim/db";
import { axisTick, ChartTip, gridStroke, tooltipWrapper } from "./chart-kit";

/**
 * Sentiment is a status encoding, not a generic categorical series — it
 * reuses the same success/muted/danger tokens the Mentions/Dashboard badges
 * use (docs/ux/DESIGN_SYSTEM.md). Four series -> a legend is mandatory;
 * stacked segments are separated by a surface-coloured gap, and only the top
 * segment is rounded.
 */
const SERIES = [
  { key: "positive", label: "Positive", color: "var(--color-success)" },
  { key: "neutral", label: "Neutral", color: "var(--color-muted-foreground)" },
  { key: "negative", label: "Negative", color: "var(--color-danger)" },
  { key: "unclassified", label: "Unclassified", color: "var(--color-border-strong)" },
] as const;

const day = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function SentimentTrendChart({ data }: { data: SentimentTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={day} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          wrapperStyle={tooltipWrapper}
          cursor={{ fill: "rgb(255 255 255 / 0.05)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTip
                title={day(String(label))}
                rows={payload.map((item) => ({
                  color: String(item.color ?? ""),
                  label: String(item.name ?? ""),
                  value: String(item.value ?? 0),
                }))}
              />
            ) : null
          }
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
        {SERIES.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stackId="sentiment"
            fill={series.color}
            stroke="var(--color-surface)"
            strokeWidth={2}
            radius={index === SERIES.length - 1 ? [6, 6, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
