"use client";

import type { ReactNode } from "react";

/**
 * Shared look for every chart: one signal gradient (violet → magenta) for a
 * single series, the validated categorical `--group-*` hues in fixed order for
 * several, recessive grid/axes, and a glass tooltip. Colours come from CSS
 * variables so the charts follow the panel's dark/light theme.
 */
export const SIGNAL_FROM = "#7b5cff";
export const SIGNAL_TO = "#ff4fa3";

export const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" } as const;
export const gridStroke = "var(--color-border)";

export const tooltipWrapper = { outline: "none", zIndex: 20 } as const;

export function GradientDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* horizontal stroke gradient for lines/areas */}
      <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={SIGNAL_FROM} />
        <stop offset="100%" stopColor={SIGNAL_TO} />
      </linearGradient>
      {/* soft vertical fill under an area */}
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={SIGNAL_FROM} stopOpacity={0.38} />
        <stop offset="60%" stopColor={SIGNAL_TO} stopOpacity={0.1} />
        <stop offset="100%" stopColor={SIGNAL_TO} stopOpacity={0} />
      </linearGradient>
      {/* vertical bar gradient */}
      <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={SIGNAL_TO} />
        <stop offset="100%" stopColor={SIGNAL_FROM} />
      </linearGradient>
      {/* horizontal bar gradient (ranked bars) */}
      <linearGradient id={`${id}-hbar`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={SIGNAL_FROM} />
        <stop offset="100%" stopColor={SIGNAL_TO} />
      </linearGradient>
      <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export type TipRow = { color?: string; label: string; value: string };

/** Glass tooltip body: a heading and one row per series. */
export function ChartTip({ title, rows }: { title?: ReactNode; rows: TipRow[] }) {
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{
        background: "color-mix(in oklab, var(--color-surface) 88%, transparent)",
        borderColor: "var(--color-border-strong)",
        color: "var(--color-foreground)",
      }}
    >
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          {row.color ? <span className="size-2 rounded-full" style={{ background: row.color }} aria-hidden="true" /> : null}
          <span className="text-muted-foreground">{row.label}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A big readable number with a caption — used above charts. */
export function Highlight({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xl font-extrabold tabular-nums tracking-tight text-foreground">
        {value}
        {hint ? <span className="ml-1.5 text-xs font-normal tracking-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}
