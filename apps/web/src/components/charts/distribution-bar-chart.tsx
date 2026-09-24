"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DistributionDatum = { label: string; value: number };

/**
 * One named category per bar, one series -> same slot-1 hue for every
 * bar, no legend box (the chart title names what's being compared) —
 * per the dataviz skill's categorical-vs-sequential rule for a single
 * ranked-magnitude series.
 */
export function DistributionBarChart({ data }: { data: DistributionDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fontSize: 12, fill: "var(--color-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
