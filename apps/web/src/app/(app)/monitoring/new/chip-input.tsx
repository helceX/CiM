"use client";

import { useState } from "react";
import { Button, Input } from "@cim/ui";
import { mergeKeywords, parseKeywordList, parseKeywordSpec } from "@cim/core";

export function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const hintId = hint ? `${label.toLowerCase().replace(/\s+/g, "-")}-hint` : undefined;
  const [draft, setDraft] = useState("");

  // One keyword = one comma-separated item (a word or a whole sentence);
  // pasting "a, b, c" adds three chips.
  function add() {
    const additions = parseKeywordList(draft);
    if (additions.length === 0) return;
    onChange(mergeKeywords(values, additions));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => {
            const spec = parseKeywordSpec(value);
            const rule = spec.caseSensitive
              ? "exact capitals, whole word"
              : spec.prefix
                ? "word starts with"
                : null;
            return (
            <li
              key={value}
              title={
                spec.caseSensitive
                  ? "Short all-caps abbreviation: matched as the whole word, with exactly these capitals."
                  : spec.prefix
                    ? "Matches words that start with this (any ending)."
                    : "Matches this word or phrase and its forms: plural, possessive and case endings (girişimci → girişimcilerin, girişimciye; startup → startups)."
              }
              className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground"
            >
              {value}
              {rule ? (
                <span className="rounded-sm bg-background/60 px-1.5 text-[11px] text-muted-foreground">{rule}</span>
              ) : null}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
