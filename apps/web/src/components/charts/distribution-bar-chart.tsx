"use client";

import { useId } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip, GradientDefs, tooltipWrapper } from "./chart-kit";

export type DistributionDatum = { label: string; value: number };

/**
 * Ranked horizontal bars: one named category per bar, one series, the same
 * signal gradient on every bar, the value printed at the bar's end (direct
 * labels — no axis needed).
 */
export function DistributionBarChart({ data }: { data: DistributionDatum[] }) {
  const id = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
        <GradientDefs id={id} />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fontSize: 12, fill: "var(--color-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          wrapperStyle={tooltipWrapper}
          cursor={{ fill: "rgb(255 255 255 / 0.05)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <ChartTip title={String(payload[0]?.payload?.label ?? "")} rows={[{ color: "#ff4fa3", label: "Mentions", value: String(payload[0]?.value ?? 0) }]} />
            ) : null
          }
        />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={20} background={{ fill: "rgb(255 255 255 / 0.04)", radius: 8 }}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={`url(#${id}-hbar)`} />
          ))}
          <LabelList dataKey="value" position="right" fill="var(--color-foreground)" fontSize={12} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
