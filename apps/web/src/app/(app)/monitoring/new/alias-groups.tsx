"use client";

import { useMemo, useState } from "react";
import { Button, Input } from "@cim/ui";
import { conceptKey, normalizeAliasGroups, suggestAliasGroups } from "@cim/core";

/**
 * "Same thing, different names": BTM = Bilgiyi Ticarileştirme Merkezi, İTO = İstanbul Ticaret Odası.
 * Every name stays an ordinary keyword; the groups only decide how results are shown together.
 */
export function AliasGroups({
  terms,
  groups,
  onChange,
  onAddTerms,
}: {
  /** the keywords and phrases the monitoring already has */
  terms: string[];
  groups: string[][];
  onChange: (next: string[][]) => void;
  /** names typed here that are not keywords yet */
  onAddTerms: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = useMemo(() => suggestAliasGroups(terms, groups), [terms, groups]);

  function accept(group: string[]) {
    onChange(normalizeAliasGroups([...groups, group]));
  }

  function addDraft() {
    const names = draft.split(/\s*(?:=|\||≈)\s*/).map((name) => name.trim()).filter(Boolean);
    if (names.length < 2) return;
    const known = new Set(terms.map(conceptKey));
    onAddTerms(names.filter((name) => !known.has(conceptKey(name))));
    accept(names);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">Same thing, different names</span>
      <p className="text-xs text-muted-foreground">
        Group names that mean the same thing — “BTM = Bilgiyi Ticarileştirme Merkezi”. Stories about any of them are read together under one heading.
      </p>
      <div className="flex gap-2">
        <Input
          value={draft}
          aria-label="Alternative spellings of one thing, separated by ="
          placeholder="İTO = İstanbul Ticaret Odası"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={addDraft}>
          Group
        </Button>
      </div>

      {suggestions.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Suggested groups">
          {suggestions.map((group) => (
            <li key={group.join("|")} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Looks like the same thing: <strong className="text-foreground">{group.join(" = ")}</strong>
              <Button type="button" size="sm" variant="secondary" onClick={() => accept(group)}>
                Group them
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {groups.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Groups">
          {groups.map((group) => (
            <li key={group.join("|")} className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground">
              {group.join(" = ")}
              <button
                type="button"
                aria-label={`Ungroup ${group.join(" and ")}`}
                onClick={() => onChange(groups.filter((candidate) => candidate !== group))}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
