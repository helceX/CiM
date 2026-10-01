"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MentionVolumePoint } from "@cim/db";
import { axisTick, ChartTip, GradientDefs, gridStroke, tooltipWrapper } from "./chart-kit";

const day = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Single series (magnitude over time) — one signal gradient, no legend (the
 * heading names the series). The zero-filled series has no gaps; the peak day
 * is marked so the eye lands on it.
 */
export function MentionTrendChart({ data }: { data: MentionVolumePoint[] }) {
  const id = useId().replace(/:/g, "");
  const peak = data.reduce<MentionVolumePoint | null>((best, point) => (!best || point.count > best.count ? point : best), null);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <GradientDefs id={id} />
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={day} tick={axisTick} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          wrapperStyle={tooltipWrapper}
          cursor={{ stroke: "var(--color-border-strong)", strokeDasharray: "4 4" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTip title={day(String(label))} rows={[{ color: "#ff4fa3", label: "Mentions", value: String(payload[0]?.value ?? 0) }]} />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={`url(#${id}-stroke)`}
          strokeWidth={3}
          fill={`url(#${id}-fill)`}
          activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2, fill: "#ff4fa3" }}
          style={{ filter: `drop-shadow(0 4px 10px rgb(255 79 163 / 0.35))` }}
        />
        {peak && peak.count > 0 ? (
          <ReferenceDot
            x={peak.date}
            y={peak.count}
            r={5}
            fill="#ffc857"
            stroke="var(--color-surface)"
            strokeWidth={2}
            label={{ value: `Peak ${peak.count}`, position: "top", fill: "var(--color-foreground)", fontSize: 11, fontWeight: 700 }}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}
