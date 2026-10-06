"use client";

import { useState } from "react";
import { countryInScope } from "@cim/core";
import { WORLD_MAP_COUNTRIES, WORLD_MAP_SPHERE, WORLD_MAP_VIEWBOX } from "./world-map-data";

/**
 * A flat 2-D world map for picking a country: countries that have sources are
 * tinted by how many, the one under the pointer lights up, the selected one
 * (and, when a continent is chosen, that continent's countries) stay marked.
 * It is a visual shortcut — the table beside it does everything the map does,
 * so the map is hidden from assistive tech and keyboard users use the table.
 */
export function WorldMap({
  counts,
  continent,
  selected,
  onSelect,
  labelFor,
}: {
  /** sources per ISO alpha-2 country code */
  counts: Record<string, number>;
  /** continent code whose countries get outlined; null when none is chosen */
  continent: string | null;
  selected: string | null;
  onSelect: (code: string) => void;
  labelFor: (code: string) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="relative rounded-xl border border-border bg-surface-muted/40 p-2" aria-hidden="true">
      <svg viewBox={WORLD_MAP_VIEWBOX} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        <path d={WORLD_MAP_SPHERE} className="wm-sphere" />
        {WORLD_MAP_COUNTRIES.map((country) => {
          const count = counts[country.code] ?? 0;
          // Square-root scale so one-source countries are still visible next to Türkiye's hundreds.
          const strength = count === 0 ? 0 : 18 + Math.round(62 * Math.sqrt(count / max));
          const classes = [
            "wm-country",
            count > 0 ? "wm-has" : "",
            continent && countryInScope(country.code, continent) ? "wm-scope" : "",
            selected === country.code ? "wm-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <path
              key={country.code}
              d={country.d}
              className={classes}
              style={{ ["--wm-strength" as string]: `${strength}%` }}
              onMouseEnter={() => setHover(country.code)}
              onClick={() => onSelect(country.code)}
            />
          );
        })}
      </svg>
      <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/85 px-2 py-1 text-xs text-foreground shadow-sm">
        {hover ? (
          <>
            <strong>{labelFor(hover)}</strong>
            <span className="text-muted-foreground">
              {" "}
              · {counts[hover] ? `${counts[hover]} source${counts[hover] === 1 ? "" : "s"}` : "no sources"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Hover a country · click to select</span>
        )}
      </p>
    </div>
  );
}
