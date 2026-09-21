"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MentionVolumePoint } from "@cim/db";

/**
 * Single series (magnitude over time) — one hue, no legend needed (the
 * chart title names the series). docs/architecture/DATA_MODEL.md's
 * zero-filled series means the line has no misleading gaps.
 */
export function MentionTrendChart({ data }: { data: MentionVolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mentionTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          formatter={(value) => [value, "Mentions"]}
          labelFormatter={(value) => new Date(String(value)).toLocaleDateString()}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#mentionTrendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
