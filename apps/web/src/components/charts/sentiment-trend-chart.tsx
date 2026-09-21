"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SentimentTrendPoint } from "@cim/db";

/**
 * Sentiment is a status encoding, not a generic categorical series — it
 * reuses the same success/muted/danger tokens the Mentions/Dashboard
 * badges already use, not a separate palette (docs/ux/DESIGN_SYSTEM.md).
 * 4 series -> legend is mandatory, stacked bars get a surface gap between
 * segments per the mark spec.
 */
const SERIES = [
  { key: "positive", label: "Positive", color: "var(--color-success)" },
  { key: "neutral", label: "Neutral", color: "var(--color-muted-foreground)" },
  { key: "negative", label: "Negative", color: "var(--color-danger)" },
  { key: "unclassified", label: "Unclassified", color: "var(--color-border-strong)" },
] as const;

export function SentimentTrendChart({ data }: { data: SentimentTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          labelFormatter={(value) => new Date(String(value)).toLocaleDateString()}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stackId="sentiment"
            fill={series.color}
            stroke="var(--color-surface)"
            strokeWidth={1}
            radius={0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
