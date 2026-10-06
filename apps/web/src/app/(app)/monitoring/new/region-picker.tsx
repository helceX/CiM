"use client";

import { useMemo, useState } from "react";
import { Checkbox, Input } from "@cim/ui";
import { CONTINENTS, COUNTRIES, LOCAL_REGION, countryName, isContinentCode, normalizeRegionScopes } from "@cim/core";

type Mode = "world" | "local" | "choose";

function modeOf(scopes: string[]): Mode {
  if (scopes.length === 0) return "world";
  if (scopes.length === 1 && scopes[0] === LOCAL_REGION) return "local";
  return "choose";
}

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "world", label: "Worldwide", hint: "Every source we read, in any country (including global feeds)." },
  { value: "local", label: "Local — Türkiye", hint: "Only sources published in Türkiye." },
  { value: "choose", label: "Choose countries or continents", hint: "Only sources from the places you pick." },
];

/**
 * Where a monitoring looks: everywhere, only Türkiye, or a chosen set of continents and countries.
 * A source with no known country (global feeds) only counts for a worldwide monitoring.
 */
export function RegionPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [mode, setMode] = useState<Mode>(modeOf(value));
  const [search, setSearch] = useState("");

  function chooseMode(next: Mode) {
    setMode(next);
    if (next === "world") onChange([]);
    else if (next === "local") onChange([LOCAL_REGION]);
    else onChange(value.length > 0 && modeOf(value) === "choose" ? value : []);
  }

  function toggle(code: string) {
    onChange(normalizeRegionScopes(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]));
  }

  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en");
    return COUNTRIES.filter((country) => !query || country.name.toLocaleLowerCase("en").includes(query) || country.code.toLowerCase() === query);
  }, [search]);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-foreground">Where to look</legend>
      <div className="flex flex-col gap-2">
        {MODES.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="region-mode"
              className="mt-1"
              checked={mode === option.value}
              onChange={() => chooseMode(option.value)}
            />
            <span>
              {option.label}
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "choose" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Continents</span>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CONTINENTS.map((continent) => (
                <label key={continent.code} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={value.includes(continent.code)} onCheckedChange={() => toggle(continent.code)} />
                  {continent.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="region-search" className="text-xs font-medium text-muted-foreground">
              Countries
            </label>
            <Input
              id="region-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a country…"
              className="mt-1"
            />
            <div className="mt-2 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {matches.map((country) => (
                <label key={country.code} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={value.includes(country.code)} onCheckedChange={() => toggle(country.code)} />
                  {country.name}
                </label>
              ))}
              {matches.length === 0 ? <p className="text-xs text-muted-foreground">No country matches.</p> : null}
            </div>
          </div>
          {value.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Chosen regions">
              {value.map((scope) => (
                <li key={scope} className="flex items-center gap-1 rounded-sm bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                  {isContinentCode(scope) ? CONTINENTS.find((c) => c.code === scope)?.name : countryName(scope)}
                  <button type="button" aria-label={`Remove ${scope}`} onClick={() => toggle(scope)} className="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Pick at least one place — with none chosen this looks worldwide.</p>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
